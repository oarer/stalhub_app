//! Нативный оверлей-прицел для Windows.
//!
//! Отдельный layered window (`WS_EX_LAYERED | WS_EX_TRANSPARENT |
//! WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`) поверх игры.
//! Невидимый фон вырезается color-key (magenta), сам прицел рисуется GDI.
//! Окно живёт на собственном потоке с message loop; команды Tauri лишь
//! обновляют конфиг и дёргают перерисовку. Никакого webview — показ
//! мгновенный, в простое ноль нагрузки.
use super::crosshair::{parse_hex_color, CrosshairConfig, CrosshairPreset};
use std::sync::{mpsc::Sender, Mutex, OnceLock};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{
    COLORREF, HINSTANCE, HMODULE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreatePen, CreateSolidBrush, DeleteDC,
    DeleteObject, Ellipse, FillRect, GetDC, GetStockObject, InvalidateRect, Polyline, ReleaseDC,
    SelectObject, HBITMAP, HDC, HGDIOBJ, HOLLOW_BRUSH, HPEN, PS_SOLID, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetSystemMetrics,
    RegisterClassW, SetLayeredWindowAttributes, SetWindowPos, ShowWindow, CS_HREDRAW, CS_VREDRAW,
    HWND_TOPMOST, LWA_ALPHA, LWA_COLORKEY, MSG, SM_CXSCREEN, SM_CYSCREEN, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WINDOW_EX_STYLE, WNDCLASSW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

/// Цвет color-key: этот цвет layered window вырезает полностью.
const KEY_COLOR: COLORREF = COLORREF(0x00FF_00FF);

/// UTF-16 с терминатором для Win32-вызовов.
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn hinstance_of(module: HMODULE) -> HINSTANCE {
    HINSTANCE(module.0)
}

fn gdiobj<T>(handle: T) -> HGDIOBJ
where
    HGDIOBJ: From<T>,
{
    HGDIOBJ::from(handle)
}

struct Manager {
    hwnd: Option<HWND>,
    visible: bool,
    config: CrosshairConfig,
    thread_running: bool,
}

// HWND — просто числовый хендл, поля защищены Mutex: перенос Manager
// между потоками безопасен, а windows-rs не даёт Send для сырых указателей.
unsafe impl Send for Manager {}

fn manager() -> &'static Mutex<Manager> {
    static MANAGER: OnceLock<Mutex<Manager>> = OnceLock::new();
    MANAGER.get_or_init(|| {
        Mutex::new(Manager {
            hwnd: None,
            visible: false,
            config: CrosshairConfig::default(),
            thread_running: false,
        })
    })
}

/// Примитивы для отрисовки. Координаты — логические пиксели окна.
#[derive(Debug, PartialEq, Eq)]
pub enum Shape {
    Bar {
        x: i32,
        y: i32,
        w: i32,
        h: i32,
    },
    Ring {
        cx: i32,
        cy: i32,
        r: i32,
        thick: i32,
    },
    /// Ручной штрих: абсолютные координаты (уже смещены к центру).
    Stroke {
        points: Vec<(i32, i32)>,
        thick: i32,
    },
}

/// Раскладка фигур прицела по центру экрана sw×sh.
pub fn layout_shapes(sw: i32, sh: i32, cfg: &CrosshairConfig) -> Vec<Shape> {
    let cx = sw / 2;
    let cy = sh / 2;
    let t = cfg.thickness as i32;
    let half = t / 2;
    let mut shapes = Vec::new();
    match cfg.preset {
        CrosshairPreset::Cross => {
            let len = cfg.size as i32;
            let gap = cfg.gap as i32;
            // Верх / низ / лево / право.
            shapes.push(Shape::Bar {
                x: cx - half,
                y: cy - gap - len,
                w: t,
                h: len,
            });
            shapes.push(Shape::Bar {
                x: cx - half,
                y: cy + gap,
                w: t,
                h: len,
            });
            shapes.push(Shape::Bar {
                x: cx - gap - len,
                y: cy - half,
                w: len,
                h: t,
            });
            shapes.push(Shape::Bar {
                x: cx + gap,
                y: cy - half,
                w: len,
                h: t,
            });
            if cfg.dot {
                push_dot(&mut shapes, cx, cy, t);
            }
        }
        CrosshairPreset::Dot => {
            let side = (cfg.size as i32).max(2);
            let d = side / 2;
            shapes.push(Shape::Bar {
                x: cx - d,
                y: cy - d,
                w: side,
                h: side,
            });
        }
        CrosshairPreset::Ring => {
            shapes.push(Shape::Ring {
                cx,
                cy,
                r: cfg.size as i32,
                thick: t,
            });
            if cfg.dot {
                push_dot(&mut shapes, cx, cy, t);
            }
        }
        CrosshairPreset::Custom => {
            for stroke in &cfg.strokes {
                let points: Vec<(i32, i32)> = stroke
                    .points
                    .iter()
                    .map(|[dx, dy]| (cx + dx, cy + dy))
                    .collect();
                if points.len() == 1 {
                    let side = t.max(2);
                    let d = side / 2;
                    let (px, py) = points[0];
                    shapes.push(Shape::Bar {
                        x: px - d,
                        y: py - d,
                        w: side,
                        h: side,
                    });
                } else if points.len() >= 2 {
                    shapes.push(Shape::Stroke { points, thick: t });
                }
            }
        }
    }
    shapes
}

fn push_dot(shapes: &mut Vec<Shape>, cx: i32, cy: i32, thickness: i32) {
    let side = thickness.max(2);
    let d = side / 2;
    shapes.push(Shape::Bar {
        x: cx - d,
        y: cy - d,
        w: side,
        h: side,
    });
}

fn rgb(color: COLORREF) -> (u8, u8, u8) {
    let v = color.0;
    (
        (v & 0xFF) as u8,
        ((v >> 8) & 0xFF) as u8,
        ((v >> 16) & 0xFF) as u8,
    )
}

fn colorref_of(cfg: &CrosshairConfig) -> COLORREF {
    // sanitized() гарантирует валидный #rrggbb.
    let (r, g, b) = parse_hex_color(&cfg.color).unwrap_or((0x4a, 0xde, 0x80));
    COLORREF(u32::from(r) | (u32::from(g) << 8) | (u32::from(b) << 16))
}

/// Показать окно (создать при первом вызове) и нарисовать конфиг.
pub fn show(config: CrosshairConfig) -> Result<bool, String> {
    ensure_thread()?;
    let hwnd = {
        let mut m = manager()
            .lock()
            .map_err(|_| "crosshair lock poisoned".to_string())?;
        m.config = config;
        m.visible = true;
        m.hwnd
            .ok_or_else(|| "crosshair window unavailable".to_string())?
    };
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        refresh_layer(hwnd);
        let _ = InvalidateRect(Some(hwnd), None, true);
    }
    Ok(true)
}

/// Скрыть окно (поток и hwnd живут дальше — повторный показ мгновенный).
pub fn hide() -> bool {
    let hwnd = manager().lock().ok().and_then(|m| m.hwnd);
    if let Some(hwnd) = hwnd {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        if let Ok(mut m) = manager().lock() {
            m.visible = false;
        }
        return true;
    }
    false
}

/// Новый конфиг: сохранить и перерисовать, если окно видимо.
pub fn apply(config: CrosshairConfig) -> bool {
    let (hwnd, visible) = match manager().lock() {
        Ok(mut m) => {
            m.config = config;
            (m.hwnd, m.visible)
        }
        Err(_) => return false,
    };
    if !visible {
        return true;
    }
    if let Some(hwnd) = hwnd {
        unsafe {
            refresh_layer(hwnd);
            let _ = InvalidateRect(Some(hwnd), None, true);
        }
        return true;
    }
    false
}

/// Обновить прозрачность color-key слоя под текущий конфиг.
unsafe fn refresh_layer(hwnd: HWND) {
    let opacity = manager()
        .lock()
        .ok()
        .map(|m| m.config.opacity)
        .unwrap_or(255);
    let _ = SetLayeredWindowAttributes(hwnd, KEY_COLOR, opacity, LWA_COLORKEY | LWA_ALPHA);
}

fn screen_size() -> (i32, i32) {
    unsafe {
        (
            GetSystemMetrics(SM_CXSCREEN).max(800),
            GetSystemMetrics(SM_CYSCREEN).max(600),
        )
    }
}

fn ensure_thread() -> Result<(), String> {
    let need_spawn = manager()
        .lock()
        .map(|m| !m.thread_running)
        .map_err(|_| "crosshair lock poisoned".to_string())?;
    if !need_spawn {
        return Ok(());
    }
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::Builder::new()
        .name("stalhub-crosshair".to_string())
        .spawn(move || overlay_thread_main(tx))
        .map_err(|e| format!("crosshair thread spawn failed: {e}"))?;
    // Ждём создания окна (ready-сигнал), серийные show не копят потоки.
    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "crosshair window init timeout".to_string())??;
    manager()
        .lock()
        .map(|mut m| m.thread_running = true)
        .map_err(|_| "crosshair lock poisoned".to_string())?;
    Ok(())
}

fn overlay_thread_main(ready: Sender<Result<(), String>>) {
    // Строки живут до конца message loop — все PCWSTR валидны всё время.
    let class_name = wide_null("StalhubCrosshair");
    unsafe {
        let instance = match GetModuleHandleW(None)
            .map(hinstance_of)
            .map_err(|e| format!("GetModuleHandleW: {e:?}"))
        {
            Ok(instance) => instance,
            Err(error) => {
                let _ = ready.send(Err(error));
                return;
            }
        };
        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: instance,
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        if RegisterClassW(&wc) == 0 {
            let _ = ready.send(Err("RegisterClassW failed".to_string()));
            return;
        }
        let (sw, sh) = screen_size();
        let title = wide_null("Stalhub Crosshair");
        let hwnd = match CreateWindowExW(
            WINDOW_EX_STYLE(
                WS_EX_LAYERED.0
                    | WS_EX_TRANSPARENT.0
                    | WS_EX_TOPMOST.0
                    | WS_EX_NOACTIVATE.0
                    | WS_EX_TOOLWINDOW.0,
            ),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            WS_POPUP,
            0,
            0,
            sw,
            sh,
            None,
            None,
            Some(instance),
            None,
        ) {
            Ok(hwnd) => hwnd,
            Err(error) => {
                let _ = ready.send(Err(format!("CreateWindowExW: {error:?}")));
                return;
            }
        };
        let _ = SetLayeredWindowAttributes(hwnd, KEY_COLOR, 255, LWA_COLORKEY | LWA_ALPHA);
        if manager().lock().map(|mut m| m.hwnd = Some(hwnd)).is_err() {
            let _ = ready.send(Err("crosshair lock poisoned".to_string()));
            return;
        }
        // Окно создано — разрешаем show() продолжать.
        let _ = ready.send(Ok(()));
        let mut msg = MSG::default();
        // GetMessageW возвращает BOOL (i32): >0 — сообщение, 0 — WM_QUIT.
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            let _ = DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // 0x000F == WM_PAINT
    if msg == 0x000F {
        paint(hwnd);
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn paint(hwnd: HWND) {
    let (sw, sh) = screen_size();
    let config = match manager().lock() {
        Ok(m) => m.config.clone(),
        Err(_) => return,
    };
    let hdc = GetDC(Some(hwnd));
    if hdc.is_invalid() {
        return;
    }
    // Двойная буферизация в memory DC: сначала key-фон, потом фигуры.
    let mem = CreateCompatibleDC(Some(hdc));
    let bmp = CreateCompatibleBitmap(hdc, sw, sh);
    let old = SelectObject(mem, gdiobj(HBITMAP(bmp.0)));
    let (kr, kg, kb) = rgb(KEY_COLOR);
    let bg = CreateSolidBrush(COLORREF(
        u32::from(kr) | (u32::from(kg) << 8) | (u32::from(kb) << 16),
    ));
    let full = RECT {
        left: 0,
        top: 0,
        right: sw,
        bottom: sh,
    };
    let _ = FillRect(mem, &full, bg);
    let _ = DeleteObject(gdiobj(bg));

    for shape in layout_shapes(sw, sh, &config) {
        draw_shape(mem, &shape, &config);
    }

    let _ = BitBlt(hdc, 0, 0, sw, sh, Some(mem), 0, 0, SRCCOPY);
    let _ = SelectObject(mem, old);
    let _ = DeleteObject(gdiobj(bmp));
    let _ = DeleteDC(mem);
    let _ = ReleaseDC(Some(hwnd), hdc);
}

unsafe fn draw_shape(hdc: HDC, shape: &Shape, cfg: &CrosshairConfig) {
    let ink = colorref_of(cfg);
    match *shape {
        Shape::Bar { x, y, w, h } => {
            if cfg.outline {
                let frame = CreateSolidBrush(COLORREF(0));
                let outer = RECT {
                    left: x - 1,
                    top: y - 1,
                    right: x + w + 1,
                    bottom: y + h + 1,
                };
                let _ = FillRect(hdc, &outer, frame);
                let _ = DeleteObject(gdiobj(frame));
            }
            let brush = CreateSolidBrush(ink);
            let rect = RECT {
                left: x,
                top: y,
                right: x + w,
                bottom: y + h,
            };
            let _ = FillRect(hdc, &rect, brush);
            let _ = DeleteObject(gdiobj(brush));
        }
        Shape::Ring { cx, cy, r, thick } => {
            // Кольцо: полой кистью + пером нужной толщины.
            let draw_ring = |radius: i32, width: i32, color: COLORREF| {
                let pen: HPEN = CreatePen(PS_SOLID, width, color);
                let old_pen = SelectObject(hdc, gdiobj(pen));
                let hollow = GetStockObject(HOLLOW_BRUSH);
                let old_brush = SelectObject(hdc, hollow);
                let _ = Ellipse(hdc, cx - radius, cy - radius, cx + radius, cy + radius);
                let _ = SelectObject(hdc, old_pen);
                let _ = SelectObject(hdc, old_brush);
                let _ = DeleteObject(gdiobj(pen));
            };
            if cfg.outline {
                draw_ring(r + 1, thick + 2, COLORREF(0));
            }
            draw_ring(r, thick, ink);
        }
        Shape::Stroke { ref points, thick } => {
            // Ломаная тем же приёмом, что кольцо: сначала чёрная
            // утолщённая, поверх цветная.
            let draw_stroke = |width: i32, color: COLORREF| {
                let pen: HPEN = CreatePen(PS_SOLID, width, color);
                let old_pen = SelectObject(hdc, gdiobj(pen));
                let apt: Vec<POINT> = points.iter().map(|(x, y)| POINT { x: *x, y: *y }).collect();
                let _ = Polyline(hdc, &apt);
                let _ = SelectObject(hdc, old_pen);
                let _ = DeleteObject(gdiobj(pen));
            };
            if cfg.outline {
                draw_stroke(thick + 2, COLORREF(0));
            }
            draw_stroke(thick, ink);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> CrosshairConfig {
        CrosshairConfig {
            preset: CrosshairPreset::Cross,
            size: 12,
            gap: 4,
            thickness: 2,
            ..Default::default()
        }
    }

    #[test]
    fn cross_layout_is_symmetric() {
        // Экран 1920×1080, центр (960, 540).
        let shapes = layout_shapes(1920, 1080, &cfg());
        assert_eq!(shapes.len(), 4);
        assert!(shapes.contains(&Shape::Bar {
            x: 959,
            y: 524,
            w: 2,
            h: 12
        }));
        assert!(shapes.contains(&Shape::Bar {
            x: 959,
            y: 544,
            w: 2,
            h: 12
        }));
        assert!(shapes.contains(&Shape::Bar {
            x: 944,
            y: 539,
            w: 12,
            h: 2
        }));
        assert!(shapes.contains(&Shape::Bar {
            x: 964,
            y: 539,
            w: 12,
            h: 2
        }));
    }

    #[test]
    fn dot_preset_scales_with_size() {
        let mut c = cfg();
        c.preset = CrosshairPreset::Dot;
        c.size = 6;
        assert_eq!(
            layout_shapes(100, 100, &c),
            vec![Shape::Bar {
                x: 47,
                y: 47,
                w: 6,
                h: 6
            }]
        );
    }

    #[test]
    fn ring_layout_has_radius_and_optional_dot() {
        let mut c = cfg();
        c.preset = CrosshairPreset::Ring;
        c.size = 10;
        c.dot = false;
        assert_eq!(
            layout_shapes(200, 200, &c),
            vec![Shape::Ring {
                cx: 100,
                cy: 100,
                r: 10,
                thick: 2
            }]
        );
        c.dot = true;
        let shapes = layout_shapes(200, 200, &c);
        assert_eq!(shapes.len(), 2);
    }

    #[test]
    fn custom_layout_offsets_strokes_to_center() {
        use crate::crosshair::Stroke;
        let mut c = cfg();
        c.preset = CrosshairPreset::Custom;
        c.thickness = 3;
        c.strokes = vec![
            Stroke {
                points: vec![[-10, 0], [10, 0]],
            },
            Stroke {
                points: vec![[5, 5]],
            },
            Stroke { points: vec![] },
        ];
        // Центр 200×200 → (100, 100).
        assert_eq!(
            layout_shapes(200, 200, &c),
            vec![
                Shape::Stroke {
                    points: vec![(90, 100), (110, 100)],
                    thick: 3
                },
                Shape::Bar {
                    x: 104,
                    y: 104,
                    w: 3,
                    h: 3
                },
            ]
        );
    }
}

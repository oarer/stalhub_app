//! Нативный оверлей-прицел для Windows.
//!
//! Отдельный layered window (`WS_EX_LAYERED | WS_EX_TRANSPARENT |
//! WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`) поверх игры.
//! Невидимый фон вырезается color-key (magenta), сам прицел рисуется GDI.
//!
//! Окно НЕ на весь экран, а ровно под bounding box прицела (+запас):
//! компоновщик смешивает только крошечную область, поэтому нагрузка
//! около нуля и FPS игры не страдает. Перерисовка — только при смене
//! конфига или показе.
//!
//! Окно живёт на собственном потоке с message loop; команды Tauri лишь
//! обновляют конфиг и дёргают перерисовку. Никакого webview и тяжёлых
//! зависимостей — только ручные FFI-деклы к user32/gdi32/kernel32.
use std::sync::{mpsc::Sender, Mutex, OnceLock};

use super::crosshair::{CrosshairConfig, CrosshairPreset};
use win::*;

/// Ручные декларации Win32: нужен десяток функций из user32/gdi32,
/// ради которых не тянем гигантский `windows`-крейт (он раздувал
/// время и размер сборки на всех платформах).
#[allow(non_snake_case, clippy::too_many_arguments)]
mod win {
    use std::ffi::c_void;

    pub type HWND = isize;
    pub type HDC = isize;
    pub type HBRUSH = isize;
    pub type HPEN = isize;
    pub type HBITMAP = isize;
    pub type HGDIOBJ = isize;
    pub type HINSTANCE = isize;
    pub type HMODULE = isize;
    pub type WPARAM = usize;
    pub type LPARAM = isize;
    pub type LRESULT = isize;

    pub type WNDPROC = Option<unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT>;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    pub struct WNDCLASSW {
        pub style: u32,
        pub lpfnWndProc: WNDPROC,
        pub cbClsExtra: i32,
        pub cbWndExtra: i32,
        pub hInstance: HINSTANCE,
        pub hIcon: isize,
        pub hCursor: isize,
        pub hbrBackground: HBRUSH,
        pub lpszMenuName: *const u16,
        pub lpszClassName: *const u16,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct MSG {
        pub hwnd: HWND,
        pub message: u32,
        pub wParam: WPARAM,
        pub lParam: LPARAM,
        pub time: u32,
        pub pt: POINT,
    }

    pub const WS_EX_LAYERED: u32 = 0x0008_0000;
    pub const WS_EX_TRANSPARENT: u32 = 0x0000_0020;
    pub const WS_EX_TOPMOST: u32 = 0x0000_0008;
    pub const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    pub const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    pub const WS_POPUP: u32 = 0x8000_0000;
    pub const HWND_TOPMOST: HWND = -1;
    pub const SW_HIDE: i32 = 0;
    pub const SW_SHOWNOACTIVATE: i32 = 4;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SWP_SHOWWINDOW: u32 = 0x0040;
    pub const LWA_COLORKEY: u32 = 0x0001;
    pub const LWA_ALPHA: u32 = 0x0002;
    pub const SM_CXSCREEN: i32 = 0;
    pub const SM_CYSCREEN: i32 = 1;
    pub const WM_PAINT: u32 = 0x000F;
    pub const PS_SOLID: i32 = 0;
    pub const HOLLOW_BRUSH: i32 = 5;
    pub const SRCCOPY: u32 = 0x00CC_0020;
    /// COLORREF magenta для color-key: 0x00BBGGRR.
    pub const KEY_COLOR: u32 = 0x00FF_00FF;

    #[link(name = "user32")]
    extern "system" {
        pub fn RegisterClassW(lpWndClass: *const WNDCLASSW) -> u16;
        pub fn CreateWindowExW(
            dwExStyle: u32,
            lpClassName: *const u16,
            lpWindowName: *const u16,
            dwStyle: u32,
            x: i32,
            y: i32,
            nWidth: i32,
            nHeight: i32,
            hWndParent: HWND,
            hMenu: isize,
            hInstance: HINSTANCE,
            lpParam: *const c_void,
        ) -> HWND;
        pub fn DefWindowProcW(hWnd: HWND, msg: u32, wParam: WPARAM, lParam: LPARAM) -> LRESULT;
        pub fn ShowWindow(hWnd: HWND, nCmdShow: i32) -> bool;
        pub fn SetWindowPos(
            hWnd: HWND,
            hWndInsertAfter: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            uFlags: u32,
        ) -> i32;
        pub fn SetLayeredWindowAttributes(hwnd: HWND, crKey: u32, bAlpha: u8, dwFlags: u32) -> i32;
        pub fn GetSystemMetrics(nIndex: i32) -> i32;
        pub fn GetMessageW(
            lpMsg: *mut MSG,
            hWnd: HWND,
            wMsgFilterMin: u32,
            wMsgFilterMax: u32,
        ) -> i32;
        pub fn DispatchMessageW(lpmsg: *const MSG) -> LRESULT;
        pub fn InvalidateRect(hWnd: HWND, lpRect: *const RECT, bErase: i32) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        pub fn GetDC(hWnd: HWND) -> HDC;
        pub fn ReleaseDC(hWnd: HWND, hDc: HDC) -> i32;
        pub fn CreateCompatibleDC(hdc: HDC) -> HDC;
        pub fn CreateCompatibleBitmap(hdc: HDC, cx: i32, cy: i32) -> HBITMAP;
        pub fn SelectObject(hdc: HDC, h: HGDIOBJ) -> HGDIOBJ;
        pub fn DeleteObject(ho: HGDIOBJ) -> i32;
        pub fn DeleteDC(hdc: HDC) -> i32;
        pub fn CreateSolidBrush(color: u32) -> HBRUSH;
        pub fn CreatePen(iStyle: i32, cWidth: i32, color: u32) -> HPEN;
        pub fn GetStockObject(i: i32) -> HGDIOBJ;
        pub fn FillRect(hdc: HDC, lprc: *const RECT, hbr: HBRUSH) -> i32;
        pub fn Ellipse(hdc: HDC, left: i32, top: i32, right: i32, bottom: i32) -> i32;
        pub fn Polyline(hdc: HDC, apt: *const POINT, cpt: i32) -> i32;
        pub fn BitBlt(
            hdc: HDC,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            hdcSrc: HDC,
            x1: i32,
            y1: i32,
            rop: u32,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetModuleHandleW(lpModuleName: *const u16) -> HMODULE;
    }
}

fn colorref_of(cfg: &CrosshairConfig) -> u32 {
    // sanitized() гарантирует валидный #rrggbb; COLORREF = 0x00BBGGRR.
    let (r, g, b) = super::crosshair::parse_hex_color(&cfg.color).unwrap_or((0x4a, 0xde, 0x80));
    u32::from(r) | (u32::from(g) << 8) | (u32::from(b) << 16)
}

struct Manager {
    hwnd: Option<HWND>,
    visible: bool,
    config: CrosshairConfig,
    thread_running: bool,
}

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

/// Bounding box прицела в экранных координатах + запас под контур.
/// Пустой рисунок (custom без штрихов) — маленькое окно по центру.
pub fn content_box(cfg: &CrosshairConfig, sw: i32, sh: i32) -> (i32, i32, i32, i32) {
    const PAD: i32 = 4;
    let shapes = layout_shapes(sw, sh, cfg);
    let (mut minx, mut miny) = (i32::MAX, i32::MAX);
    let (mut maxx, mut maxy) = (i32::MIN, i32::MIN);
    let mut grow = |x0: i32, y0: i32, x1: i32, y1: i32| {
        minx = minx.min(x0);
        miny = miny.min(y0);
        maxx = maxx.max(x1);
        maxy = maxy.max(y1);
    };
    for shape in &shapes {
        match *shape {
            Shape::Bar { x, y, w, h } => grow(x, y, x + w, y + h),
            Shape::Ring { cx, cy, r, thick } => {
                let e = r + thick + 2;
                grow(cx - e, cy - e, cx + e, cy + e);
            }
            Shape::Stroke { ref points, thick } => {
                let e = thick + 3;
                for (x, y) in points {
                    grow(x - e, y - e, x + e, y + e);
                }
            }
        }
    }
    if minx > maxx {
        let (cx, cy) = (sw / 2, sh / 2);
        return (cx - 4, cy - 4, 8, 8);
    }
    (
        minx - PAD,
        miny - PAD,
        maxx - minx + PAD * 2,
        maxy - miny + PAD * 2,
    )
}

/// Показать окно (создать при первом вызове) и нарисовать конфиг.
pub fn show(config: CrosshairConfig) -> Result<bool, String> {
    ensure_thread()?;
    let (hwnd, (x, y, w, h)) = {
        let mut m = manager()
            .lock()
            .map_err(|_| "crosshair lock poisoned".to_string())?;
        m.config = config;
        m.visible = true;
        let (sw, sh) = screen_size();
        let bounds = content_box(&m.config, sw, sh);
        let hwnd = m
            .hwnd
            .ok_or_else(|| "crosshair window unavailable".to_string())?;
        (hwnd, bounds)
    };
    unsafe {
        // Окно ровно под контент: компоновщик трогает только эти пиксели.
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            w,
            h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        refresh_layer(hwnd);
        InvalidateRect(hwnd, std::ptr::null(), 1);
    }
    Ok(true)
}

/// Скрыть окно (поток и hwnd живут дальше — повторный показ мгновенный).
pub fn hide() -> bool {
    let hwnd = manager().lock().ok().and_then(|m| m.hwnd);
    if let Some(hwnd) = hwnd {
        unsafe {
            ShowWindow(hwnd, SW_HIDE);
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
    let (hwnd, visible, bounds) = match manager().lock() {
        Ok(mut m) => {
            m.config = config;
            let (sw, sh) = screen_size();
            (m.hwnd, m.visible, content_box(&m.config, sw, sh))
        }
        Err(_) => return false,
    };
    if !visible {
        return true;
    }
    if let Some(hwnd) = hwnd {
        let (x, y, w, h) = bounds;
        unsafe {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                x,
                y,
                w,
                h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            refresh_layer(hwnd);
            InvalidateRect(hwnd, std::ptr::null(), 1);
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
    SetLayeredWindowAttributes(hwnd, KEY_COLOR, opacity, LWA_COLORKEY | LWA_ALPHA);
}

fn screen_size() -> (i32, i32) {
    unsafe {
        (
            GetSystemMetrics(SM_CXSCREEN).max(800),
            GetSystemMetrics(SM_CYSCREEN).max(600),
        )
    }
}

/// UTF-16 с терминатором для Win32-вызовов.
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
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
    // Строки живут до конца message loop — все указатели валидны всё время.
    let class_name = wide_null("StalhubCrosshair");
    let title = wide_null("Stalhub Crosshair");
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        if instance == 0 {
            let _ = ready.send(Err("GetModuleHandleW failed".to_string()));
            return;
        }
        let wc = WNDCLASSW {
            style: 0x0003, // CS_HREDRAW | CS_VREDRAW
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: 0,
            hCursor: 0,
            hbrBackground: 0,
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        if RegisterClassW(&wc) == 0 {
            let _ = ready.send(Err("RegisterClassW failed".to_string()));
            return;
        }
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP,
            0,
            0,
            64,
            64,
            0,
            0,
            instance,
            std::ptr::null(),
        );
        if hwnd == 0 {
            let _ = ready.send(Err("CreateWindowExW failed".to_string()));
            return;
        }
        SetLayeredWindowAttributes(hwnd, KEY_COLOR, 255, LWA_COLORKEY | LWA_ALPHA);
        if manager().lock().map(|mut m| m.hwnd = Some(hwnd)).is_err() {
            let _ = ready.send(Err("crosshair lock poisoned".to_string()));
            return;
        }
        // Окно создано — разрешаем show() продолжать.
        let _ = ready.send(Ok(()));
        let mut msg = MSG::default();
        // GetMessageW возвращает BOOL (i32): >0 — сообщение, 0 — WM_QUIT.
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_PAINT {
        paint(hwnd);
        return 0;
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn paint(hwnd: HWND) {
    let (config, bounds) = match manager().lock() {
        Ok(m) => {
            let (sw, sh) = screen_size();
            let bounds = content_box(&m.config, sw, sh);
            (m.config.clone(), bounds)
        }
        Err(_) => return,
    };
    let (ox, oy, w, h) = bounds;
    let hdc = GetDC(hwnd);
    if hdc == 0 || hdc == -1 {
        return;
    }
    // Двойная буферизация в memory DC: сначала key-фон, потом фигуры.
    // Фигуры в экранных координатах — сдвигаем на origin окна.
    let mem = CreateCompatibleDC(hdc);
    let bmp = CreateCompatibleBitmap(hdc, w, h);
    let old = SelectObject(mem, bmp);
    let bg = CreateSolidBrush(KEY_COLOR);
    let full = RECT {
        left: 0,
        top: 0,
        right: w,
        bottom: h,
    };
    FillRect(mem, &full, bg);
    DeleteObject(bg);

    for shape in layout_shapes(screen_size().0, screen_size().1, &config) {
        draw_shape(mem, &shape, &config, ox, oy);
    }

    BitBlt(hdc, 0, 0, w, h, mem, 0, 0, SRCCOPY);
    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(hwnd, hdc);
}

unsafe fn draw_shape(hdc: HDC, shape: &Shape, cfg: &CrosshairConfig, ox: i32, oy: i32) {
    let ink = colorref_of(cfg);
    match *shape {
        Shape::Bar { x, y, w, h } => {
            let (x, y) = (x - ox, y - oy);
            if cfg.outline {
                let frame = CreateSolidBrush(0);
                let outer = RECT {
                    left: x - 1,
                    top: y - 1,
                    right: x + w + 1,
                    bottom: y + h + 1,
                };
                FillRect(hdc, &outer, frame);
                DeleteObject(frame);
            }
            let brush = CreateSolidBrush(ink);
            let rect = RECT {
                left: x,
                top: y,
                right: x + w,
                bottom: y + h,
            };
            FillRect(hdc, &rect, brush);
            DeleteObject(brush);
        }
        Shape::Ring { cx, cy, r, thick } => {
            let (cx, cy) = (cx - ox, cy - oy);
            // Кольцо: полой кистью + пером нужной толщины.
            let draw_ring = |radius: i32, width: i32, color: u32| {
                let pen = CreatePen(PS_SOLID, width, color);
                let old_pen = SelectObject(hdc, pen);
                let hollow = GetStockObject(HOLLOW_BRUSH);
                let old_brush = SelectObject(hdc, hollow);
                Ellipse(hdc, cx - radius, cy - radius, cx + radius, cy + radius);
                SelectObject(hdc, old_pen);
                SelectObject(hdc, old_brush);
                DeleteObject(pen);
            };
            if cfg.outline {
                draw_ring(r + 1, thick + 2, 0);
            }
            draw_ring(r, thick, ink);
        }
        Shape::Stroke { ref points, thick } => {
            // Ломаная тем же приёмом, что кольцо: сначала чёрная
            // утолщённая, поверх цветная.
            let draw_stroke = |width: i32, color: u32| {
                let pen = CreatePen(PS_SOLID, width, color);
                let old_pen = SelectObject(hdc, pen);
                let apt: Vec<POINT> = points
                    .iter()
                    .map(|(x, y)| POINT {
                        x: x - ox,
                        y: y - oy,
                    })
                    .collect();
                Polyline(hdc, apt.as_ptr(), apt.len() as i32);
                SelectObject(hdc, old_pen);
                DeleteObject(pen);
            };
            if cfg.outline {
                draw_stroke(thick + 2, 0);
            }
            draw_stroke(thick, ink);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crosshair::Stroke;

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

    #[test]
    fn content_box_fits_cross_tightly() {
        // Крест 12/4/2 на 1920×1080: линии x 944..976, y 524..556.
        let (x, y, w, h) = content_box(&cfg(), 1920, 1080);
        assert_eq!((x, y, w, h), (940, 520, 40, 40));
    }

    #[test]
    fn content_box_falls_back_when_empty() {
        let mut c = cfg();
        c.preset = CrosshairPreset::Custom;
        c.strokes = vec![];
        let (x, y, w, h) = content_box(&c, 1920, 1080);
        assert_eq!((x, y, w, h), (956, 536, 8, 8));
    }
}

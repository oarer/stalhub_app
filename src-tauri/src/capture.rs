use base64::Engine;
use image::RgbaImage;
use serde::{Deserialize, Serialize};

/// Окно из списка захвата. id — индекс в xcap::Window::all()
/// в пределах одного вызова capture_list_windows.
#[derive(Debug, Clone, Serialize)]
pub struct CaptureWindow {
    pub id: String,
    pub title: String,
    pub app: String,
}

/// Регион в координатах кадра (аналог Selection {x,y,width,height} в trading.ts).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrame {
    pub width: u32,
    pub height: u32,
    /// JPEG, base64. invoke не умеет бинарные ответы компактно.
    pub jpeg_base64: String,
}

const DEFAULT_MAX_WIDTH: u32 = 1280;
const JPEG_QUALITY: u8 = 70;
const MAX_JPEG_BYTES: usize = 8 * 1024 * 1024;

/// Пересечение региона с кадром. Чистая функция — покрыта unit-тестами.
fn clip_region(img_w: u32, img_h: u32, region: CaptureRegion) -> Option<(u32, u32, u32, u32)> {
    let x = region.x.min(img_w);
    let y = region.y.min(img_h);
    let w = region.width.min(img_w.saturating_sub(x));
    let h = region.height.min(img_h.saturating_sub(y));
    if w == 0 || h == 0 {
        return None;
    }
    Some((x, y, w, h))
}

/// Приоритет окна игры (меньше — лучше). Зеркалит порядок PowerShell-матчинга
/// из src/game-window.ts: сначала точное имя процесса stalzone, затем stalcraft;
/// заголовки — только fallback (вкладки браузеров тоже содержат имя игры).
fn game_score(app: &str, title: &str) -> Option<u8> {
    let app = app.to_lowercase();
    let title = title.to_lowercase();
    if app == "stalzone" {
        return Some(0);
    }
    if app == "stalcraft" {
        return Some(1);
    }
    if app.contains("stalzone") {
        return Some(2);
    }
    if app.contains("stalcraft") {
        return Some(3);
    }
    if title.contains("stalzone") {
        return Some(4);
    }
    if title.contains("stalcraft") {
        return Some(5);
    }
    None
}

fn crop_and_encode(
    image: &RgbaImage,
    region: Option<CaptureRegion>,
    max_width: u32,
) -> Result<CaptureFrame, String> {
    let (img_w, img_h) = image.dimensions();
    let view = match region {
        Some(region) => match clip_region(img_w, img_h, region) {
            Some((x, y, w, h)) => image::imageops::crop_imm(image, x, y, w, h).to_image(),
            None => return Err("region outside frame".to_string()),
        },
        None => image.clone(),
    };

    let (mut width, mut height) = view.dimensions();
    let mut pixels = view;
    if max_width > 0 && width > max_width {
        height = ((height as u64 * max_width as u64) / width as u64).max(1) as u32;
        width = max_width;
        pixels = image::imageops::resize(
            &pixels,
            width,
            height,
            image::imageops::FilterType::Triangle,
        );
    }

    let rgb = image::DynamicImage::ImageRgba8(pixels).to_rgb8();
    let mut jpeg = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY);
    encoder
        .encode_image(&rgb)
        .map_err(|e| format!("jpeg encode failed: {e}"))?;
    if jpeg.len() > MAX_JPEG_BYTES {
        return Err("frame too large".to_string());
    }

    Ok(CaptureFrame {
        width,
        height,
        jpeg_base64: base64::engine::general_purpose::STANDARD.encode(&jpeg),
    })
}

#[cfg(not(target_os = "android"))]
fn list_windows_impl() -> Result<Vec<CaptureWindow>, String> {
    let windows = xcap::Window::all().map_err(|e| format!("window list failed: {e}"))?;
    Ok(windows
        .iter()
        .enumerate()
        .map(|(index, window)| CaptureWindow {
            id: index.to_string(),
            title: window.title().to_string(),
            app: window.app_name().to_string(),
        })
        .collect())
}

#[cfg(not(target_os = "android"))]
fn grab_window(id: &str) -> Result<RgbaImage, String> {
    let index: usize = id.parse().map_err(|_| "unknown window id".to_string())?;
    let windows = xcap::Window::all().map_err(|e| format!("window list failed: {e}"))?;
    let window = windows.get(index).ok_or("unknown window id")?;
    window
        .capture_image()
        .map_err(|e| format!("window capture failed: {e}"))
}

#[cfg(not(target_os = "android"))]
fn grab_primary_monitor() -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("monitor list failed: {e}"))?;
    let monitor = monitors
        .iter()
        .find(|monitor| monitor.is_primary())
        .or(monitors.first())
        .ok_or("no monitors".to_string())?;
    monitor
        .capture_image()
        .map_err(|e| format!("monitor capture failed: {e}"))
}

/// Список окон для выбора источника (аналог desktopCapturer.getSources).
#[tauri::command]
pub fn capture_list_windows() -> Result<Vec<CaptureWindow>, String> {
    #[cfg(target_os = "android")]
    {
        let _ = ();
        return Err("screen capture needs MediaProjection session (Phase 5b)".to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        list_windows_impl()
    }
}

/// Поиск окна игры (замена PowerShell-матчинга src/game-window.ts).
/// Возвращает null, если не найдено — UI откатывается на ручной выбор.
#[tauri::command]
pub fn capture_find_game() -> Result<Option<CaptureWindow>, String> {
    #[cfg(target_os = "android")]
    {
        let _ = ();
        return Err("screen capture needs MediaProjection session (Phase 5b)".to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let windows = list_windows_impl()?;
        Ok(windows
            .into_iter()
            .filter_map(|window| {
                game_score(&window.app, &window.title).map(|score| (score, window))
            })
            .min_by_key(|(score, _)| *score)
            .map(|(_, window)| window))
    }
}

/// Кадр по запросу (pull, ~5 Гц из webview).
/// window_id: null — primary monitor; region: null — весь кадр.
#[tauri::command]
pub fn capture_frame(
    window_id: Option<String>,
    region: Option<CaptureRegion>,
    max_width: Option<u32>,
) -> Result<CaptureFrame, String> {
    #[cfg(target_os = "android")]
    {
        let _ = (window_id, region, max_width);
        return Err("screen capture needs MediaProjection session (Phase 5b)".to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let image = match window_id {
            Some(id) => grab_window(&id)?,
            None => grab_primary_monitor()?,
        };
        crop_and_encode(&image, region, max_width.unwrap_or(DEFAULT_MAX_WIDTH))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_region_to_frame() {
        assert_eq!(
            clip_region(
                100,
                100,
                CaptureRegion {
                    x: 10,
                    y: 10,
                    width: 50,
                    height: 50
                }
            ),
            Some((10, 10, 50, 50))
        );
        assert_eq!(
            clip_region(
                100,
                100,
                CaptureRegion {
                    x: 80,
                    y: 80,
                    width: 50,
                    height: 50
                }
            ),
            Some((80, 80, 20, 20))
        );
        assert_eq!(
            clip_region(
                100,
                100,
                CaptureRegion {
                    x: 200,
                    y: 0,
                    width: 10,
                    height: 10
                }
            ),
            None
        );
        assert_eq!(
            clip_region(
                100,
                100,
                CaptureRegion {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 10
                }
            ),
            None
        );
    }

    #[test]
    fn ranks_game_windows_like_powershell_matcher() {
        assert_eq!(game_score("stalzone", "Anything"), Some(0));
        assert_eq!(game_score("stalcraft", "Anything"), Some(1));
        assert_eq!(game_score("stalzone-launcher", "x"), Some(2));
        assert_eq!(game_score("chrome", "stalzone wiki"), Some(4));
        assert_eq!(game_score("chrome", "news"), None);
    }
}

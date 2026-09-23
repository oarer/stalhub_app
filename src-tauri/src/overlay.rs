use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "overlay";
const URL: &str = "calcs/trading/overlay";

#[tauri::command]
pub fn trading_overlay_open(app: AppHandle) -> bool {
    if let Some(window) = app.get_webview_window(LABEL) {
        return window.show().and_then(|_| window.set_focus()).is_ok();
    }
    match WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(URL.into()))
        .title("Stalhub Trading")
        .inner_size(420.0, 640.0)
        .min_inner_size(320.0, 480.0)
        .max_inner_size(520.0, 900.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .build()
    {
        Ok(window) => window.set_focus().is_ok(),
        Err(error) => {
            log::warn!("trading overlay open failed: {error}");
            false
        }
    }
}

#[tauri::command]
pub fn trading_overlay_close(app: AppHandle) -> bool {
    match app.get_webview_window(LABEL) {
        Some(window) => window.close().is_ok(),
        None => true,
    }
}

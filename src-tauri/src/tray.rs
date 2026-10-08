//! Трей + поведение закрытия главного окна (только desktop).
//!
//! - Иконка в трее, меню: открыть окно, тоггл прицела (Windows),
//!   выход. Левый клик toggles главное окно.
//! - Закрытие главного окна перехватывается: поведение читается из
//!   store (`ask` — спросить модалкой во фронтенде, `tray` — скрыть,
//!   `close` — выйти).
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;

const SETTINGS_STORE: &str = "stalhub-settings.dat";
const CLOSE_KEY: &str = "closeBehavior";

/// Что делать при закрытии главного окна.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    Ask,
    Close,
    Tray,
}

impl Default for CloseBehavior {
    fn default() -> Self {
        CloseBehavior::Ask
    }
}

impl CloseBehavior {
    fn from_str(value: &str) -> Option<Self> {
        match value {
            "ask" => Some(CloseBehavior::Ask),
            "close" => Some(CloseBehavior::Close),
            "tray" => Some(CloseBehavior::Tray),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            CloseBehavior::Ask => "ask",
            CloseBehavior::Close => "close",
            CloseBehavior::Tray => "tray",
        }
    }
}

fn load_behavior(app: &AppHandle) -> CloseBehavior {
    app.store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(CLOSE_KEY))
        .and_then(|value| {
            value
                .as_str()
                .and_then(CloseBehavior::from_str)
                .or_else(|| serde_json::from_value(value).ok())
        })
        .unwrap_or_default()
}

fn persist_behavior(app: &AppHandle, behavior: CloseBehavior) {
    if let Ok(store) = app.store(SETTINGS_STORE) {
        store.set(CLOSE_KEY, serde_json::json!(behavior.as_str()));
        let _ = store.save();
    }
}

fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

fn show_main(app: &AppHandle) -> bool {
    if let Some(window) = main_window(app) {
        return window.show().and_then(|_| window.set_focus()).is_ok();
    }
    false
}

fn hide_main(app: &AppHandle) -> bool {
    if let Some(window) = main_window(app) {
        return window.hide().is_ok();
    }
    false
}

/// Точка входа из перехваченного CloseRequested главного окна.
pub fn handle_main_close(app: &AppHandle) {
    match load_behavior(app) {
        CloseBehavior::Close => app.exit(0),
        CloseBehavior::Tray => {
            hide_main(app);
        }
        CloseBehavior::Ask => {
            // Модалка живёт во фронтенде; ответ вернётся командой
            // window_close_answer. Окно уже prevent_close'd вызывателем.
            if let Some(window) = main_window(app) {
                let _ = window.emit("stalhub:ask-close", ());
            } else {
                app.exit(0);
            }
        }
    }
}

/// Построить иконку трея с меню. Ошибки — в warn, старт приложения
/// никогда не роняем из-за трея.
#[cfg(desktop)]
pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let menu = build_menu(app)?;
    // Иконка приложения из бандла (без PNG-декодера и лишних ассетов).
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "tray: no app icon".to_string())?;

    TrayIconBuilder::with_id("stalhub")
        .icon(icon)
        .menu(&menu)
        .tooltip("Stalhub")
        .on_menu_event(move |app, event| {
            let id = event.id();
            if id == "tray-open" {
                show_main(app);
            } else if id == "tray-quit" {
                app.exit(0);
            }
            #[cfg(target_os = "windows")]
            if id == "tray-crosshair" {
                toggle_crosshair(app);
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Левый клик — показать/скрыть главное окно.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let visible = main_window(app)
                    .map(|w| w.is_visible().unwrap_or(true))
                    .unwrap_or(true);
                if visible {
                    hide_main(app);
                } else {
                    show_main(app);
                }
            }
        })
        .build(app)
        .map_err(|e| format!("tray build: {e}"))?;

    Ok(())
}

/// Меню трея. Чек прицела отражает текущую видимость оверлея.
#[cfg(desktop)]
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::menu::Menu<R>, String> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let menu = Menu::new(app).map_err(|e| format!("tray menu: {e}"))?;
    let open = MenuItem::with_id(app, "tray-open", "Открыть Stalhub", true, None::<&str>)
        .map_err(|e| format!("tray menu open: {e}"))?;
    menu.append(&open)
        .map_err(|e| format!("tray menu append: {e}"))?;

    // Тоггл прицела — только там, где есть нативный оверлей (Windows).
    #[cfg(target_os = "windows")]
    {
        use tauri::menu::CheckMenuItem;
        let checked = super::crosshair::is_visible();
        let item = CheckMenuItem::new(app, "tray-crosshair", "Прицел", true, checked, None::<&str>)
            .map_err(|e| format!("tray crosshair item: {e}"))?;
        menu.append(&item)
            .map_err(|e| format!("tray menu append: {e}"))?;
    }

    let separator =
        PredefinedMenuItem::separator(app).map_err(|e| format!("tray separator: {e}"))?;
    menu.append(&separator)
        .map_err(|e| format!("tray menu append: {e}"))?;
    let quit = MenuItem::with_id(app, "tray-quit", "Выйти", true, None::<&str>)
        .map_err(|e| format!("tray menu quit: {e}"))?;
    menu.append(&quit)
        .map_err(|e| format!("tray menu append: {e}"))?;
    Ok(menu)
}

/// Тоггл прицела из трея + синк чека меню и фронта.
#[cfg(target_os = "windows")]
fn toggle_crosshair(app: &AppHandle) {
    use super::crosshair;

    let visible = !crosshair::is_visible();
    let ok = if visible {
        crosshair::show_sync(app)
    } else {
        crosshair::hide_sync()
    };
    if !ok {
        return;
    }
    // Чек обновляем пересборкой меню (дешево, только по тогглу).
    if let Ok(menu) = build_menu(app) {
        if let Some(tray) = app.tray_by_id("stalhub") {
            let _ = tray.set_menu(Some(menu));
        }
    }
    if let Some(window) = main_window(app) {
        let _ = window.emit("stalhub:crosshair-visible", visible);
    }
}

/// Текущее поведение закрытия (для настроек).
#[tauri::command]
pub async fn window_close_behavior_get(app: AppHandle) -> Result<CloseBehavior, String> {
    Ok(load_behavior(&app))
}

/// Сменить запомненное поведение (настройки).
#[tauri::command]
pub async fn window_close_behavior_set(
    app: AppHandle,
    behavior: CloseBehavior,
) -> Result<bool, String> {
    persist_behavior(&app, behavior);
    Ok(true)
}

/// Ответ модалки закрытия: `close` — выйти, `tray` — скрыть.
/// `remember` — запомнить выбор как поведение по умолчанию.
#[tauri::command]
pub async fn window_close_answer(
    app: AppHandle,
    action: String,
    remember: bool,
) -> Result<bool, String> {
    match action.as_str() {
        "tray" => {
            if remember {
                persist_behavior(&app, CloseBehavior::Tray);
            }
            Ok(hide_main(&app))
        }
        "close" => {
            if remember {
                persist_behavior(&app, CloseBehavior::Close);
            }
            app.exit(0);
            Ok(true)
        }
        _ => Err("expected action close|tray".to_string()),
    }
}

/// Показать главное окно.
#[tauri::command]
pub async fn window_show_main(app: AppHandle) -> Result<bool, String> {
    Ok(show_main(&app))
}

/// Скрыть главное окно в трей.
#[tauri::command]
pub async fn window_hide_main(app: AppHandle) -> Result<bool, String> {
    Ok(hide_main(&app))
}

/// Выйти из приложения.
#[tauri::command]
pub async fn app_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_behaviors() {
        assert_eq!(CloseBehavior::from_str("ask"), Some(CloseBehavior::Ask));
        assert_eq!(CloseBehavior::from_str("close"), Some(CloseBehavior::Close));
        assert_eq!(CloseBehavior::from_str("tray"), Some(CloseBehavior::Tray));
        assert_eq!(CloseBehavior::from_str("nope"), None);
        assert_eq!(CloseBehavior::default(), CloseBehavior::Ask);
    }

    #[test]
    fn serializes_behavior_as_string() {
        let value = serde_json::to_value(CloseBehavior::Tray).expect("json");
        assert_eq!(value, serde_json::json!("tray"));
    }
}

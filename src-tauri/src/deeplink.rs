use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

pub const AUTH_EVENT: &str = "stalhub:auth-callback";
pub const IMPORT_EVENT: &str = "stalhub:import";
const AUTH_URL_MAX_LENGTH: usize = 8192;
const IMPORT_URL_MAX_LENGTH: usize = 300_000;
const PENDING_CAP: usize = 16;

#[derive(Default)]
struct ChannelState {
    ready: bool,
    pending: Vec<String>,
}

#[derive(Default)]
pub struct PendingLinks {
    auth: Mutex<ChannelState>,
    import: Mutex<ChannelState>,
}

fn has_credentials(parsed: &url::Url) -> bool {
    !parsed.username().is_empty() || parsed.password().is_some()
}

/// stalhub://auth/callback без userinfo/порта/hash (аналог callbackUrl).
fn valid_auth_callback(raw: &str) -> Option<String> {
    if raw.len() > AUTH_URL_MAX_LENGTH {
        return None;
    }
    let parsed = url::Url::parse(raw).ok()?;
    if parsed.scheme() != "stalhub"
        || parsed.host_str() != Some("auth")
        || parsed.path() != "/callback"
        || has_credentials(&parsed)
        || parsed.port().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }
    Some(parsed.to_string())
}

/// stalhub://import/<token> без userinfo/порта/hash (аналог importUrl).
fn valid_import(raw: &str) -> Option<String> {
    if raw.len() > IMPORT_URL_MAX_LENGTH {
        return None;
    }
    let parsed = url::Url::parse(raw).ok()?;
    if parsed.scheme() != "stalhub"
        || parsed.host_str() != Some("import")
        || has_credentials(&parsed)
        || parsed.port().is_some()
        || parsed.fragment().is_some()
        || !parsed.path().starts_with('/')
    {
        return None;
    }
    Some(parsed.to_string())
}

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn push_unique(state: &Mutex<ChannelState>, url: String) {
    if let Ok(mut channel) = state.lock() {
        if !channel.pending.contains(&url) {
            if channel.pending.len() >= PENDING_CAP {
                channel.pending.remove(0);
            }
            channel.pending.push(url);
        }
    }
}

fn flush(app: &AppHandle, event: &str, state: &Mutex<ChannelState>) {
    let drained: Vec<String> = state
        .lock()
        .map(|mut channel| {
            if !channel.ready {
                return Vec::new();
            }
            std::mem::take(&mut channel.pending)
        })
        .unwrap_or_default();
    for url in drained {
        let _ = app.emit_to("main", event, &url);
    }
}

fn accept(app: &AppHandle, raw: &str) {
    let state = app.state::<PendingLinks>();
    if valid_import(raw).is_some() {
        push_unique(&state.import, raw.to_string());
        focus_main(app);
        flush(app, IMPORT_EVENT, &state.import);
    } else if valid_auth_callback(raw).is_some() {
        push_unique(&state.auth, raw.to_string());
        focus_main(app);
        flush(app, AUTH_EVENT, &state.auth);
    }
}

/// Точка входа из deep-link plugin (стартовые ссылки + second-instance).
pub fn handle_open(app: &AppHandle, urls: Vec<url::Url>) {
    for url in urls {
        accept(app, url.as_str());
    }
}

/// Сигнал готовности рендера: слить накопленную очередь в main window.
/// channel: "auth" | "import" (аналог renderer-ready / import-ready).
#[tauri::command]
pub fn renderer_ready(app: AppHandle, channel: String) -> Result<(), String> {
    let state = app.state::<PendingLinks>();
    let target = match channel.as_str() {
        "auth" => (&state.auth, AUTH_EVENT),
        "import" => (&state.import, IMPORT_EVENT),
        _ => return Err("unknown channel".to_string()),
    };
    if let Ok(mut channel_state) = target.0.lock() {
        channel_state.ready = true;
    }
    flush(&app, target.1, target.0);
    Ok(())
}

/// Рендер отписался: ссылки снова копятся в pending (аналог
/// stalhub:renderer-not-ready / import-not-ready).
#[tauri::command]
pub fn renderer_not_ready(app: AppHandle, channel: String) -> Result<(), String> {
    let state = app.state::<PendingLinks>();
    let target = match channel.as_str() {
        "auth" => &state.auth,
        "import" => &state.import,
        _ => return Err("unknown channel".to_string()),
    };
    if let Ok(mut channel_state) = target.lock() {
        channel_state.ready = false;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_auth_callback() {
        let url = "stalhub://auth/callback?code=abc&state=xyz";
        assert_eq!(valid_auth_callback(url), Some(url.to_string()));
    }

    #[test]
    fn rejects_bad_auth_callbacks() {
        assert!(valid_auth_callback("https://auth/callback").is_none());
        assert!(valid_auth_callback("stalhub://auth/other").is_none());
        assert!(valid_auth_callback("stalhub://auth/callback#frag").is_none());
        assert!(valid_auth_callback("stalhub://user@auth/callback").is_none());
        assert!(valid_auth_callback("stalhub://auth:80/callback").is_none());
        assert!(valid_auth_callback(&format!(
            "stalhub://auth/callback?{}",
            "x".repeat(AUTH_URL_MAX_LENGTH)
        ))
        .is_none());
    }

    #[test]
    fn accepts_valid_import() {
        let url = "stalhub://import/abc123";
        assert_eq!(valid_import(url), Some(url.to_string()));
    }

    #[test]
    fn rejects_bad_imports() {
        assert!(valid_import("stalhub://auth/callback").is_none());
        assert!(valid_import("stalhub://import").is_none());
        assert!(valid_import("stalhub://import/a#b").is_none());
        assert!(valid_import(&format!(
            "stalhub://import/{}",
            "x".repeat(IMPORT_URL_MAX_LENGTH)
        ))
        .is_none());
    }
}

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use cookie_store::CookieStore;
use reqwest::{redirect::Policy, Client, Method};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// Фиксированный upstream. Без изменений бэкенда (решение из плана).
const API_ORIGIN: &str = "https://api.stalhub.dev";
const SETTINGS_STORE: &str = "stalhub-settings.dat";
const SESSION_KEY: &str = "session_cookies";

const MAX_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_FILE_BYTES: usize = 25 * 1024 * 1024;
const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

// Hop-by-hop + служебные, как в desktop-api-proxy.ts / desktop-upload-proxy.ts.
const STRIP_RESPONSE_HEADERS: &[&str] = &[
    "host",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
    "proxy-authenticate",
    "te",
    "trailer",
    "content-length",
    "set-cookie",
    "content-encoding",
    "access-control-allow-origin",
    "access-control-allow-credentials",
];

// Allowlist запросных заголовков из webview (без cookie — им владеет jar).
const ALLOW_REQUEST_HEADERS: &[&str] = &[
    "accept",
    "content-type",
    "authorization",
    "range",
    "if-none-match",
    "if-modified-since",
    "user-agent",
];

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ApiBody {
    Empty,
    Text {
        #[serde(rename = "contentType")]
        content_type: String,
        data: String,
    },
    Base64 {
        #[serde(rename = "contentType")]
        content_type: String,
        data: String,
    },
    Form {
        fields: Vec<FormField>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum FormField {
    Field {
        name: String,
        value: String,
    },
    File {
        name: String,
        filename: String,
        #[serde(rename = "contentType")]
        content_type: String,
        /// base64
        data: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResult {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
    is_base64: bool,
}

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(120))
            .build()
            .expect("reqwest client")
    })
}

fn api_url() -> reqwest::Url {
    reqwest::Url::parse(API_ORIGIN).expect("API_ORIGIN")
}

fn bad_request(message: &str) -> String {
    format!("bad request: {message}")
}

fn validate_path(path: &str, method: &Method) -> Result<(), String> {
    if !path.starts_with('/') || path.contains(['\\', '%', '?', '#', '\r', '\n', '\0']) {
        return Err(bad_request("invalid path"));
    }
    let is_api = path == "/api/v1" || path.starts_with("/api/v1/");
    let is_upload = path == "/uploads" || path.starts_with("/uploads/");
    let is_status = path == "/api/status";
    let is_error_report = path == "/api/error-report";
    if !(is_api || is_status || is_error_report || is_upload) {
        return Err(bad_request("path not proxied"));
    }
    if is_upload && *method != Method::GET {
        return Err(bad_request("uploads proxy is GET-only"));
    }
    let segments: Vec<&str> = path.split('/').collect();
    for (index, segment) in segments.iter().enumerate() {
        if segment.is_empty() {
            // Ведущий и замыкающий слеш допустимы, двойные — нет.
            if index != 0 && index != segments.len() - 1 {
                return Err(bad_request("invalid path segment"));
            }
            continue;
        }
        if *segment == "." || *segment == ".." {
            return Err(bad_request("invalid path segment"));
        }
    }
    Ok(())
}

fn load_jar(app: &AppHandle) -> CookieStore {
    let mut jar = CookieStore::new(None);
    let url = api_url();
    let persisted: Vec<String> = app
        .store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(SESSION_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    for raw in &persisted {
        if let Ok(cookie) = cookie::Cookie::parse(raw.as_str()) {
            let _ = jar.insert_raw(&cookie, &url);
        }
    }
    jar
}

fn persist_jar(app: &AppHandle, jar: &Mutex<CookieStore>) {
    let raw: Vec<String> = jar
        .lock()
        .map(|store| store.iter_any().map(|c| c.to_string()).collect())
        .unwrap_or_default();
    if let Ok(store) = app.store(SETTINGS_STORE) {
        store.set(SESSION_KEY, serde_json::json!(raw));
        let _ = store.save();
    }
}

fn request_cookie_header(jar: &CookieStore) -> Option<String> {
    let url = api_url();
    let values: Vec<String> = jar
        .matches(&url)
        .into_iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect();
    if values.is_empty() {
        None
    } else {
        Some(values.join("; "))
    }
}

fn store_response_cookies(jar: &Mutex<CookieStore>, headers: &reqwest::header::HeaderMap) {
    let url = api_url();
    if let Ok(mut store) = jar.lock() {
        for value in headers.get_all(reqwest::header::SET_COOKIE).iter() {
            if let Ok(text) = value.to_str() {
                if let Ok(cookie) = cookie::Cookie::parse(text) {
                    let _ = store.insert_raw(&cookie, &url);
                }
            }
        }
    }
}

/// Прокси одного HTTP-запроса к api.stalhub.dev.
/// Вызывается из webview через axios-адаптер (web/src/lib/tauri-api-adapter.ts).
#[tauri::command]
pub async fn api_proxy(
    app: AppHandle,
    method: String,
    path: String,
    query: Option<String>,
    headers: HashMap<String, String>,
    body: ApiBody,
    timeout_ms: Option<u64>,
) -> Result<ApiResult, String> {
    let method: Method = method.parse().map_err(|_| bad_request("invalid method"))?;
    if !matches!(
        method,
        Method::GET
            | Method::POST
            | Method::PUT
            | Method::PATCH
            | Method::DELETE
            | Method::HEAD
            | Method::OPTIONS
    ) {
        return Err(bad_request("method not proxied"));
    }
    validate_path(&path, &method)?;
    if let Some(query) = query.as_deref() {
        if query.contains(['\r', '\n', '\0']) {
            return Err(bad_request("invalid query"));
        }
    }

    let mut target = format!("{API_ORIGIN}{path}");
    if let Some(query) = query.filter(|q| !q.is_empty()) {
        target.push('?');
        target.push_str(&query);
    }

    let jar = Mutex::new(load_jar(&app));

    let mut request = client()
        .request(
            method.clone(),
            target
                .parse::<reqwest::Url>()
                .map_err(|_| bad_request("invalid target"))?,
        )
        .timeout(Duration::from_millis(
            timeout_ms
                .unwrap_or(DEFAULT_TIMEOUT_MS)
                .clamp(1_000, 120_000),
        ));

    for (name, value) in &headers {
        let lower = name.to_lowercase();
        if !ALLOW_REQUEST_HEADERS.contains(&lower.as_str()) {
            continue;
        }
        if lower == "content-type" && matches!(body, ApiBody::Form { .. }) {
            // Boundary multipart соберёт reqwest; чужой заголовок сломал бы парсинг.
            continue;
        }
        request = request.header(lower, value.clone());
    }
    if let Some(cookie) = request_cookie_header(&jar.lock().expect("jar")) {
        request = request.header(reqwest::header::COOKIE, cookie);
    }

    match body {
        ApiBody::Empty => {}
        ApiBody::Text { content_type, data } => {
            if data.len() > MAX_BODY_BYTES {
                return Err(bad_request("body too large"));
            }
            request = request
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .body(data);
        }
        ApiBody::Base64 { content_type, data } => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|_| bad_request("invalid base64 body"))?;
            if bytes.len() > MAX_BODY_BYTES {
                return Err(bad_request("body too large"));
            }
            request = request
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .body(bytes);
        }
        ApiBody::Form { fields } => {
            let mut form = reqwest::multipart::Form::new();
            let mut total = 0usize;
            for field in fields {
                match field {
                    FormField::Field { name, value } => {
                        total += value.len();
                        if total > MAX_BODY_BYTES {
                            return Err(bad_request("body too large"));
                        }
                        form = form.text(name, value);
                    }
                    FormField::File {
                        name,
                        filename,
                        content_type,
                        data,
                    } => {
                        let bytes = base64::engine::general_purpose::STANDARD
                            .decode(data)
                            .map_err(|_| bad_request("invalid base64 file"))?;
                        if bytes.len() > MAX_FILE_BYTES {
                            return Err(bad_request("file too large"));
                        }
                        total += bytes.len();
                        if total > MAX_BODY_BYTES {
                            return Err(bad_request("body too large"));
                        }
                        let part = reqwest::multipart::Part::bytes(bytes)
                            .file_name(filename)
                            .mime_str(&content_type)
                            .map_err(|_| bad_request("invalid file mime"))?;
                        form = form.part(name, part);
                    }
                }
            }
            request = request.multipart(form);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("upstream unavailable: {e}"))?;
    store_response_cookies(&jar, response.headers());
    persist_jar(&app, &jar);

    let status = response.status();
    if status.is_redirection() && status != reqwest::StatusCode::NOT_MODIFIED {
        return Err("unexpected upstream redirect".to_string());
    }

    if let Some(len) = response.content_length() {
        if len > MAX_RESPONSE_BYTES {
            return Err("response too large".to_string());
        }
    }
    let mut headers = HashMap::new();
    for (name, value) in response.headers().iter() {
        let lower = name.as_str().to_lowercase();
        if STRIP_RESPONSE_HEADERS.contains(&lower.as_str()) {
            continue;
        }
        if let Ok(text) = value.to_str() {
            headers
                .entry(lower)
                .or_insert_with(String::new)
                .push_str(text);
        }
    }

    let mut bytes = Vec::new();
    let mut stream = response;
    loop {
        match stream.chunk().await {
            Ok(Some(chunk)) => {
                bytes.extend_from_slice(&chunk);
                if bytes.len() as u64 > MAX_RESPONSE_BYTES {
                    return Err("response too large".to_string());
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("upstream body failed: {e}")),
        }
    }

    let (body, is_base64) = match String::from_utf8(bytes) {
        Ok(text) => (text, false),
        Err(error) => (
            base64::engine::general_purpose::STANDARD.encode(error.into_bytes()),
            true,
        ),
    };

    Ok(ApiResult {
        status: status.as_u16(),
        headers,
        body,
        is_base64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_api_v1_paths() {
        for method in [
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ] {
            assert!(validate_path("/api/v1/users/@me", &method).is_ok());
            assert!(validate_path("/api/v1/auth/refresh", &method).is_ok());
        }
        assert!(validate_path("/api/status", &Method::GET).is_ok());
        assert!(validate_path("/api/error-report", &Method::POST).is_ok());
        assert!(validate_path("/uploads/abc123.png", &Method::GET).is_ok());
    }

    #[test]
    fn rejects_traversal_and_foreign_paths() {
        assert!(validate_path("/api/v1/../etc/passwd", &Method::GET).is_err());
        assert!(validate_path("/api/v1/%2e%2e/x", &Method::GET).is_err());
        assert!(validate_path("/api/v1/a\\b", &Method::GET).is_err());
        assert!(validate_path("/api/v1/a?b", &Method::GET).is_err());
        assert!(validate_path("https://evil.com/api/v1/x", &Method::GET).is_err());
        assert!(validate_path("/api/v2/users", &Method::GET).is_err());
        assert!(validate_path("/other/path", &Method::GET).is_err());
        assert!(validate_path("/uploads/x.png", &Method::POST).is_err());
        assert!(validate_path("/api/v1//double", &Method::GET).is_err());
    }

    /// Wire-формат JS-адаптера (camelCase): регрессия на
    /// "missing field `content_type`" при POST (auth exchange).
    #[test]
    fn deserializes_js_wire_bodies() {
        let text: ApiBody =
            serde_json::from_str(r#"{"kind":"text","contentType":"application/json","data":"{}"}"#)
                .expect("text body");
        assert!(matches!(text, ApiBody::Text { .. }));

        let form: ApiBody = serde_json::from_str(
            r#"{"kind":"form","fields":[{"kind":"field","name":"a","value":"b"},{"kind":"file","name":"file","filename":"x.png","contentType":"image/png","data":"e30="}]}"#,
        )
        .expect("form body");
        assert!(matches!(form, ApiBody::Form { .. }));

        let empty: ApiBody = serde_json::from_str(r#"{"kind":"empty"}"#).expect("empty");
        assert!(matches!(empty, ApiBody::Empty));
    }
}

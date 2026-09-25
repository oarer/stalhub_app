use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Резолв через GitHub API: /releases/latest отдаёт только стабильные
/// релизы, а наши — пререлизы. API возвращает и те, и другие (новые сверху).
const RELEASES_API_URL: &str =
    "https://api.github.com/repos/oarer/stalhub_app/releases?per_page=10";
const MANIFEST_ASSET_NAME: &str = "android-update.json";
const USER_AGENT: &str = "stalhub-app";
const ALLOWED_HOST: &str = "github.com";
const ALLOWED_PREFIX: &str = "/oarer/stalhub_app/releases/";
/// Universal-APK на 4 ABI в release-профиле — сотни мегабайт.
const MAX_APK_BYTES: u64 = 600 * 1024 * 1024;

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    prerelease: bool,
    assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct AndroidUpdateManifest {
    version: String,
    url: String,
    notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    latest_version: String,
    notes: Option<String>,
    url: String,
    needs_update: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo {
    path: String,
    size: u64,
}

/// "1.2.3" / "v1.2.3" → (1,2,3). Суффиксы -rc.1/+build отбрасываются.
fn parse_version(raw: &str) -> Option<(u64, u64, u64)> {
    let core = raw
        .trim()
        .strip_prefix('v')
        .unwrap_or(raw.trim())
        .split(['-', '+'])
        .next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn is_newer(current: &str, latest: &str) -> bool {
    match (parse_version(current), parse_version(latest)) {
        (Some(current), Some(latest)) => latest > current,
        _ => false,
    }
}

/// Только релизные ассеты нашего репозитория — мост не качает произвольное.
fn valid_download_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some(ALLOWED_HOST)
        && url.path().starts_with(ALLOWED_PREFIX)
        && url.path().ends_with(".apk")
        && url.username().is_empty()
}

/// Проверка обновления: манифест → сравнение с текущей версией пакета.
/// manifest_url для тестов/кастома; channel: "stable" — только стабильные
/// релизы, иначе (None/"prerelease") — любые свежие, включая пререлизы.
#[tauri::command]
pub async fn android_check_update(
    app: AppHandle,
    manifest_url: Option<String>,
    channel: Option<String>,
) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("http client failed: {e}"))?;
    let stable_only = channel.as_deref() == Some("stable");
    let url = match manifest_url {
        Some(url) => url,
        None => resolve_manifest_url(&client, stable_only).await?,
    };
    let manifest: AndroidUpdateManifest = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("update manifest unavailable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("update manifest unavailable: {e}"))?
        .json()
        .await
        .map_err(|e| format!("invalid update manifest: {e}"))?;
    if !valid_download_url(&manifest.url) {
        return Err("update manifest points outside releases".to_string());
    }
    let current = app.package_info().version.to_string();
    Ok(UpdateInfo {
        needs_update: is_newer(&current, &manifest.version),
        current_version: current,
        latest_version: manifest.version,
        notes: manifest.notes,
        url: manifest.url,
    })
}

/// Новейший релиз с android-update.json. stable_only отбрасывает пререлизы.
async fn resolve_manifest_url(
    client: &reqwest::Client,
    stable_only: bool,
) -> Result<String, String> {
    let releases: Vec<GithubRelease> = client
        .get(RELEASES_API_URL)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("update manifest unavailable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("update manifest unavailable: {e}"))?
        .json()
        .await
        .map_err(|e| format!("invalid update manifest: {e}"))?;
    releases
        .iter()
        .filter(|release| !stable_only || !release.prerelease)
        .flat_map(|release| release.assets.iter())
        .find(|asset| asset.name == MANIFEST_ASSET_NAME)
        .map(|asset| asset.browser_download_url.clone())
        .ok_or_else(|| "update manifest unavailable: no manifest asset".to_string())
}

/// Скачивание APK в cache_dir. Работает везде (нужно и для тестов моста).
#[tauri::command]
pub async fn android_download_update(app: AppHandle, url: String) -> Result<DownloadInfo, String> {
    if !valid_download_url(&url) {
        return Err("refusing to download outside releases".to_string());
    }
    let file_name = url
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty() && !name.contains(".."))
        .ok_or("invalid apk url".to_string())?;
    let cache = app
        .path()
        .cache_dir()
        .map_err(|e| format!("cache dir unavailable: {e}"))?;
    let dest = cache.join(format!("stalhub-update-{file_name}"));

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("http client failed: {e}"))?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?;
    if let Some(len) = response.content_length() {
        if len > MAX_APK_BYTES {
            return Err("apk too large".to_string());
        }
    }
    let mut size = 0u64;
    let mut file = std::fs::File::create(&dest).map_err(|e| format!("cache write failed: {e}"))?;
    use std::io::Write;
    let mut stream = response;
    loop {
        match stream.chunk().await {
            Ok(Some(chunk)) => {
                size += chunk.len() as u64;
                if size > MAX_APK_BYTES {
                    let _ = std::fs::remove_file(&dest);
                    return Err("apk too large".to_string());
                }
                file.write_all(&chunk)
                    .map_err(|e| format!("cache write failed: {e}"))?;
            }
            Ok(None) => break,
            Err(e) => {
                let _ = std::fs::remove_file(&dest);
                return Err(format!("download failed: {e}"));
            }
        }
    }
    Ok(DownloadInfo {
        path: dest.to_string_lossy().into_owned(),
        size,
    })
}

/// Установка скачанного APK: ACTION_VIEW-интент через FileProvider
/// (install-плагин). Системный установщик сам запросит разрешение
/// на установку из неизвестных источников (Android 8+).
#[tauri::command]
pub fn android_install_update(app: AppHandle, path: String) -> Result<(), String> {
    let cache = app
        .path()
        .cache_dir()
        .map_err(|e| format!("cache dir unavailable: {e}"))?;
    let target = std::path::Path::new(&path);
    if !target.starts_with(&cache)
        || target.extension().is_none_or(|ext| ext != "apk")
        || !target.is_file()
    {
        return Err("refusing to install outside update cache".to_string());
    }
    #[cfg(target_os = "android")]
    {
        use stalhub_installer::InstallerExt;
        app.installer().install_apk(path)
    }
    #[cfg(not(target_os = "android"))]
    {
        return Err("desktop uses plugin-updater".to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions() {
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("v10.0.1"), Some((10, 0, 1)));
        assert_eq!(parse_version("1.2.3-rc.1"), Some((1, 2, 3)));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("abc"), None);
    }

    #[test]
    fn compares_versions() {
        assert!(is_newer("1.0.0", "1.0.1"));
        assert!(is_newer("1.0.9", "1.1.0"));
        assert!(is_newer("v2.0.0", "10.0.0"));
        assert!(!is_newer("1.0.1", "1.0.1"));
        assert!(!is_newer("2.0.0", "1.9.9"));
        assert!(!is_newer("broken", "1.0.0"));
        assert!(!is_newer("1.0.0", "broken"));
    }

    #[test]
    fn validates_download_urls() {
        assert!(valid_download_url(
			"https://github.com/oarer/stalhub_app/releases/download/v1.0.0/app-universal-release.apk"
		));
        assert!(!valid_download_url(
            "https://evil.com/oarer/stalhub_app/releases/download/v1.0.0/app.apk"
        ));
        assert!(!valid_download_url(
            "https://github.com/oarer/other/releases/download/v1.0.0/app.apk"
        ));
        assert!(!valid_download_url(
            "https://github.com/oarer/stalhub_app/releases/download/v1.0.0/app.zip"
        ));
        assert!(!valid_download_url(
            "http://github.com/oarer/stalhub_app/releases/download/v1/app.apk"
        ));
        assert!(!valid_download_url("not a url"));
    }

    #[test]
    fn finds_manifest_asset_in_releases() {
        let releases: Vec<GithubRelease> = serde_json::from_str(
            r#"[{"tag_name":"v0.0.2","prerelease":true,"assets":[]},{"tag_name":"v0.0.1","prerelease":false,"assets":[{"name":"android-update.json","browser_download_url":"https://github.com/oarer/stalhub_app/releases/download/v0.0.1/android-update.json"}]}]"#,
        )
        .expect("releases");
        let pick = |stable_only: bool| {
            releases
                .iter()
                .filter(|release| !stable_only || !release.prerelease)
                .flat_map(|release| release.assets.iter())
                .find(|asset| asset.name == MANIFEST_ASSET_NAME)
                .map(|asset| asset.browser_download_url.clone())
        };
        assert_eq!(
            pick(false).as_deref(),
            Some("https://github.com/oarer/stalhub_app/releases/download/v0.0.1/android-update.json")
        );
        assert_eq!(
            pick(true).as_deref(),
            Some("https://github.com/oarer/stalhub_app/releases/download/v0.0.1/android-update.json")
        );
        let empty: Vec<GithubRelease> = serde_json::from_str(
            r#"[{"tag_name":"v0.0.2","prerelease":true,"assets":[]}]"#,
        )
        .expect("releases");
        assert!(
            empty
                .iter()
                .filter(|release| !release.prerelease)
                .flat_map(|release| release.assets.iter())
                .find(|asset| asset.name == MANIFEST_ASSET_NAME)
                .is_none()
        );
    }

    #[test]
    fn parses_manifest() {        let manifest: AndroidUpdateManifest = serde_json::from_str(
			r#"{"version":"1.2.0","url":"https://github.com/oarer/stalhub_app/releases/download/v1.2.0/app.apk","notes":"fix"}"#,
		)
		.expect("manifest");
        assert_eq!(manifest.version, "1.2.0");
        assert_eq!(manifest.notes.as_deref(), Some("fix"));
    }
}

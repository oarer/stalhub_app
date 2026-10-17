#![allow(dead_code)]
//! Блокировщик игровых серверов (Windows only).
//
//! - `server_blocker_fetch` — скачать address_list региона (чтобы не упираться в CORS).
//! - `server_blocker_ping` — TCP-connect замер до `ip:port` (параллельно, N попыток).
//! - `server_blocker_admin` / `server_blocker_status` — проверка прав и текущего правила.
//! - `server_blocker_apply` / `server_blocker_clear` — создать/удалить правило.
//! - `server_blocker_restart_elevated` — перезапустить приложение с правами админа (UAC).

use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::time::{Duration, Instant};

const RULE_NAME: &str = "Stalhub Server Block";

fn region_url(region: &str) -> Option<&'static str> {
    match region.to_uppercase().as_str() {
        "RU" => Some("https://backend.stalzone.net/address_list?login=User"),
        "NEA" => Some("https://backend-nea.stalzone.net/address_list?login=User"),
        "SEA" => Some("https://backend-sea.stalzone.net/address_list?login=User"),
        "EU" => Some("https://backend-eu.stalzone.net/address_list?login=User"),
        "NA" => Some("https://backend-na.stalzone.net/address_list?login=User"),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tunnel {
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pool {
    pub name: String,
    pub tunnels: Vec<Tunnel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddressList {
    pub mode: Option<String>,
    pub pools: Vec<Pool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub address: String,
    pub ok: bool,
    pub avg_ms: Option<u64>,
    pub min_ms: Option<u64>,
    pub attempts: u32,
    pub success: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallStatus {
    pub admin: bool,
    pub rule_exists: bool,
    pub blocked_ips: Vec<String>,
    pub supported: bool,
}

#[tauri::command]
pub async fn server_blocker_fetch(region: String) -> Result<AddressList, String> {
    let url = region_url(&region)
        .ok_or_else(|| format!("Unknown region: {region} (RU/NEA/SEA/EU/NA)"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch {region}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("fetch {region}: http {}", resp.status()));
    }
    resp.json::<AddressList>()
        .await
        .map_err(|e| format!("parse {region}: {e}"))
}

fn ping_once(address: &str, timeout: Duration) -> Option<u64> {
    let start = Instant::now();
    // connect_timeout блокирующий — вызываем из tokio blocking-пула.
    let addr: std::net::SocketAddr = match address.parse() {
        Ok(a) => a,
        Err(_) => return None,
    };
    match std::net::TcpStream::connect_timeout(&addr, timeout) {
        Ok(_) => Some(start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64),
        Err(_) => None,
    }
}

/// TCP-пинг списка `ip:port`. Параллельно через spawn_blocking, attempts попыток на адрес.
#[tauri::command]
pub async fn server_blocker_ping(
    addresses: Vec<String>,
    timeout_ms: Option<u64>,
    attempts: Option<u32>,
) -> Result<Vec<PingResult>, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000).clamp(500, 10_000));
    let attempts = attempts.unwrap_or(2).clamp(1, 5);
    // Ограничение, чтобы не положить систему сотнями потоков.
    let mut list = addresses;
    list.sort();
    list.dedup();
    if list.len() > 300 {
        return Err("Too many addresses (max 300)".to_string());
    }

    let mut handles = Vec::with_capacity(list.len());
    for address in list {
        let addr = address.clone();
        handles.push(tauri::async_runtime::spawn_blocking(move || {
            let mut times: Vec<u64> = Vec::new();
            let mut success = 0u32;
            for _ in 0..attempts {
                if let Some(ms) = ping_once(&addr, timeout) {
                    times.push(ms);
                    success += 1;
                }
            }
            let (avg_ms, min_ms) = if times.is_empty() {
                (None, None)
            } else {
                let min = *times.iter().min().unwrap_or(&0);
                let avg = times.iter().sum::<u64>() / times.len() as u64;
                (Some(avg), Some(min))
            };
            PingResult {
                address: addr,
                ok: success > 0,
                avg_ms,
                min_ms,
                attempts,
                success,
            }
        }));
    }

    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(r) => out.push(r),
            Err(e) => return Err(format!("ping task: {e}")),
        }
    }
    out.sort_by(|a, b| {
        match (a.avg_ms, b.avg_ms) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.address.cmp(&b.address),
        }
    });
    Ok(out)
}

fn run_netsh(args: &[&str]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("netsh")
            .args(args)
            .output()
            .map_err(|e| format!("netsh: {e}"))?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        if out.status.success() {
            Ok(text)
        } else {
            Err(format!("netsh {} failed: {text}", args.join(" ")))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = args;
        Err("Firewall block доступен только под Windows".to_string())
    }
}

/// Проверка админ-прав через `net session` (работает только у администратора).
#[tauri::command]
pub fn server_blocker_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("net")
            .args(["session"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn strip_port(address: &str) -> String {
    // address вида "1.2.3.4:29450" — для firewall нужен только IP.
    address.rsplit_once(':').map(|(ip, _)| ip).unwrap_or(address).to_string()
}

fn parse_remoteips(show_output: &str) -> Vec<String> {
    // В выводе `show rule ... verbose` есть строка "RemoteIP: 1.1.1.1, 2.2.2.2".
    let mut ips = Vec::new();
    for line in show_output.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("RemoteIP") {
            if let Some(list) = rest.split_once(':').map(|(_, v)| v) {
                for ip in list.split([',', ' ']) {
                    let ip = ip.trim();
                    if !ip.is_empty() && ip.to_lowercase() != "any" {
                        ips.push(ip.to_string());
                    }
                }
            }
        }
    }
    ips.sort();
    ips.dedup();
    ips
}

/// Применить блокировку: удалить старое правило и создать новое со списком IP.
/// `blocked_addresses` — `ip:port` или голые IP; порты отрезаются.
#[tauri::command]
pub fn server_blocker_apply(blocked_addresses: Vec<String>) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = blocked_addresses;
        return Err("Firewall block доступен только под Windows".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if !server_blocker_admin() {
            return Err(
                "Нужны права администратора: перезапусти Stalhub от имени администратора".to_string(),
            );
        }
        let mut ips: Vec<String> = blocked_addresses.iter().map(|a| strip_port(a)).collect();
        ips.sort();
        ips.dedup();
        ips.retain(|ip| !ip.is_empty());
        if ips.is_empty() {
            // Нечего блокировать — просто чистим правило (= всё разрешено).
            let _ = run_netsh(&["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")]);
            return Ok("Блокировок нет: правило удалено, все сервера разрешены".to_string());
        }
        if ips.len() > 500 {
            return Err("Слишком много IP для одного правила (max 500)".to_string());
        }
        // Удаляем старое правило (ошибка «not found» — не ошибка).
        let _ = run_netsh(&["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")]);
        let remoteip = ips.join(",");
        // ВАЖНО: не вкладывать кавычки в значения аргументов (name="...").
        // Command::args сам обернёт значение с пробелами в кавычки, а вложенные
        // кавычки netsh не распарсит и напечатает справку вместо применения правила.
        let out = run_netsh(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={RULE_NAME}"),
            "dir=out",
            "action=block",
            "enable=yes",
            "profile=any",
            &format!("remoteip={remoteip}"),
            "description=Stalhub: блокировка игровых серверов с высоким пингом",
        ])?;
        Ok(format!("Заблокировано IP: {}. {out}", ips.len()).trim().to_string())
    }
}

#[tauri::command]
pub fn server_blocker_clear() -> Result<String, String> {
    let out = run_netsh(&["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")])?;
    Ok(out)
}

#[tauri::command]
pub fn server_blocker_status() -> FirewallStatus {
    #[cfg(not(target_os = "windows"))]
    {
        return FirewallStatus {
            admin: false,
            rule_exists: false,
            blocked_ips: vec![],
            supported: false,
        };
    }
    #[cfg(target_os = "windows")]
    {
        let admin = server_blocker_admin();
        let show = run_netsh(&[
            "advfirewall",
            "firewall",
            "show",
            "rule",
            &format!("name={RULE_NAME}"),
            "verbose",
        ]);
        match show {
            Ok(text) => {
                // "No rules match" — английский вывод; на локализованных Windows
                // текст другой, поэтому опираемся на фактическое наличие IP.
                let blocked = parse_remoteips(&text);
                FirewallStatus {
                    admin,
                    rule_exists: !blocked.is_empty(),
                    blocked_ips: blocked,
                    supported: true,
                }
            }
            Err(_) => FirewallStatus {
                admin,
                rule_exists: false,
                blocked_ips: vec![],
                supported: true,
            },
        }
    }
}

/// Перезапуск приложения с правами админа (UAC-запрос). Текущий процесс завершается вызывающим кодом.
#[tauri::command]
pub fn server_blocker_restart_elevated() -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        Err("Перезапуск с правами админа доступен только под Windows".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        let exe_str = exe.to_string_lossy().to_string();
        // Start-Process -Verb RunAs показывает UAC-диалог.
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Start-Process -FilePath '{exe_str}' -Verb RunAs"),
            ])
            .status()
            .map_err(|e| format!("powershell: {e}"))?;
        if status.success() {
            Ok("Перезапуск с правами администратора запущен".to_string())
        } else {
            Err("Не удалось запросить права администратора".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_urls_known() {
        for r in ["RU", "NEA", "SEA", "EU", "NA", "ru", "eu"] {
            assert!(region_url(r).is_some(), "{r}");
        }
        assert!(region_url("XX").is_none());
    }

    #[test]
    fn strip_port_works() {
        assert_eq!(strip_port("1.2.3.4:29450"), "1.2.3.4");
        assert_eq!(strip_port("1.2.3.4"), "1.2.3.4");
    }

    #[test]
    fn parse_remoteips_works() {
        let sample = "Rule Name: Stalhub Server Block\nRemoteIP: 1.1.1.1, 2.2.2.2\n";
        assert_eq!(parse_remoteips(sample), vec!["1.1.1.1", "2.2.2.2"]);
        assert!(parse_remoteips("No rules match the specified criteria.").is_empty());
    }
}

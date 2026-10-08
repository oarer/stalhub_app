use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// Нативный оверлей-прицел (HUD sight).
/// Рендер — Win32 layered window + GDI, только Windows (STALCRAFT —
/// Windows-only игра). Остальные платформы отвечают `unsupported`, UI
/// прячет секцию настроек. Состояние видимости — рантайм (по умолчанию
/// скрыт при старте); конфиг персистится в stalhub-settings.dat.
const SETTINGS_STORE: &str = "stalhub-settings.dat";
const CONFIG_KEY: &str = "crosshair";

/// Пресет геометрии прицела.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrosshairPreset {
    Cross,
    Dot,
    Ring,
    Custom,
}

impl Default for CrosshairPreset {
    fn default() -> Self {
        CrosshairPreset::Cross
    }
}

impl CrosshairPreset {
    fn from_str(value: &str) -> Option<Self> {
        match value {
            "cross" => Some(CrosshairPreset::Cross),
            "dot" => Some(CrosshairPreset::Dot),
            "ring" => Some(CrosshairPreset::Ring),
            "custom" => Some(CrosshairPreset::Custom),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            CrosshairPreset::Cross => "cross",
            CrosshairPreset::Dot => "dot",
            CrosshairPreset::Ring => "ring",
            CrosshairPreset::Custom => "custom",
        }
    }
}

/// Один нарисованный штрих: смещения точек от центра в пикселях.
/// Цвет/толщина/контур берутся из общего конфига при отрисовке.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stroke {
    #[serde(default)]
    pub points: Vec<[i32; 2]>,
}

/// Лимиты ручного рисунка (защита store от распухания).
const MAX_STROKES: usize = 24;
const MAX_STROKE_POINTS: usize = 200;
const MAX_STROKE_OFFSET: i32 = 192;

/// Конфиг прицела. Границы задаёт `sanitized()` — UI может слать сырые
/// значения со слайдеров без предварительной валидации.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosshairConfig {
    #[serde(default)]
    pub preset: CrosshairPreset,
    #[serde(default = "default_size")]
    pub size: u32,
    #[serde(default = "default_gap")]
    pub gap: u32,
    #[serde(default = "default_thickness")]
    pub thickness: u32,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_opacity")]
    pub opacity: u8,
    #[serde(default)]
    pub dot: bool,
    #[serde(default = "default_true")]
    pub outline: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub strokes: Vec<Stroke>,
}

fn default_size() -> u32 {
    12
}
fn default_gap() -> u32 {
    4
}
fn default_thickness() -> u32 {
    2
}
fn default_color() -> String {
    "#4ade80".to_string()
}
fn default_opacity() -> u8 {
    255
}
fn default_true() -> bool {
    true
}

impl Default for CrosshairConfig {
    fn default() -> Self {
        CrosshairConfig {
            preset: CrosshairPreset::default(),
            size: default_size(),
            gap: default_gap(),
            thickness: default_thickness(),
            color: default_color(),
            opacity: default_opacity(),
            dot: false,
            outline: true,
            enabled: true,
            strokes: Vec::new(),
        }
    }
}

impl CrosshairConfig {
    /// Клэмп диапазонов + нормализация цвета. Невалидный цвет —
    /// дефолтный зелёный, а не ошибка: слайдеры/пипетка не должны
    /// ронять invoke.
    pub fn sanitized(&self) -> CrosshairConfig {
        let mut out = self.clone();
        out.size = out.size.clamp(2, 64);
        out.gap = out.gap.clamp(0, 32);
        out.thickness = out.thickness.clamp(1, 12);
        if out.opacity < 32 {
            out.opacity = 32;
        }
        if parse_hex_color(&out.color).is_none() {
            out.color = default_color();
        } else {
            out.color = out.color.to_lowercase();
        }
        if CrosshairPreset::from_str(out.preset.as_str()).is_none() {
            out.preset = CrosshairPreset::default();
        }
        // Штрихи: обрезать количество, длину и координаты. Пустые
        // (все точки вне диапазона после клэмпа не бывает — клэмп,
        // а не отсев) и слишком короткие выбрасываем.
        out.strokes.truncate(MAX_STROKES);
        out.strokes = out
            .strokes
            .into_iter()
            .map(|stroke| Stroke {
                points: stroke
                    .points
                    .into_iter()
                    .take(MAX_STROKE_POINTS)
                    .map(|[x, y]| {
                        [
                            x.clamp(-MAX_STROKE_OFFSET, MAX_STROKE_OFFSET),
                            y.clamp(-MAX_STROKE_OFFSET, MAX_STROKE_OFFSET),
                        ]
                    })
                    .collect(),
            })
            .filter(|stroke| !stroke.points.is_empty())
            .collect();
        out
    }
}

/// `#rrggbb` → (r, g, b). Принимает с `#` и без, 3- и 6-значный формат.
pub fn parse_hex_color(value: &str) -> Option<(u8, u8, u8)> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    let expanded: String = match hex.len() {
        3 => hex.chars().flat_map(|c| [c, c]).collect(),
        6 => hex.to_string(),
        _ => return None,
    };
    if !expanded.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let r = u8::from_str_radix(&expanded[0..2], 16).ok()?;
    let g = u8::from_str_radix(&expanded[2..4], 16).ok()?;
    let b = u8::from_str_radix(&expanded[4..6], 16).ok()?;
    Some((r, g, b))
}

fn load_config(app: &AppHandle) -> CrosshairConfig {
    app.store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(CONFIG_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn persist_config(app: &AppHandle, config: &CrosshairConfig) {
    if let Ok(store) = app.store(SETTINGS_STORE) {
        store.set(CONFIG_KEY, serde_json::json!(config));
        let _ = store.save();
    }
}

fn unsupported() -> String {
    "crosshair unsupported on this platform".to_string()
}

/// Текущий конфиг (не показывает окно).
#[tauri::command]
pub async fn crosshair_get(app: AppHandle) -> Result<CrosshairConfig, String> {
    Ok(load_config(&app).sanitized())
}

/// Показать прицел поверх игры. Возвращает false, если окно
/// создать не удалось (возврата к webview-фолбэку нет — только Windows).
#[tauri::command]
pub async fn crosshair_show(app: AppHandle) -> Result<bool, String> {
    let config = load_config(&app).sanitized();
    #[cfg(target_os = "windows")]
    {
        return crosshair_win::show(config);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, config);
        return Err(unsupported());
    }
}

/// Скрыть прицел.
#[tauri::command]
pub async fn crosshair_hide(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        return Ok(crosshair_win::hide());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        return Err(unsupported());
    }
}

/// Сохранить конфиг; если прицел видим — перерисовать сразу.
///
/// Вне Windows только персистит (чтобы настройки можно было крутить
/// и на Linux/macOS), показать там нечего — show вернёт unsupported.
#[tauri::command]
pub async fn crosshair_set(app: AppHandle, config: CrosshairConfig) -> Result<bool, String> {
    let config = config.sanitized();
    persist_config(&app, &config);
    #[cfg(target_os = "windows")]
    {
        return Ok(crosshair_win::apply(config));
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Ok(true);
    }
}

#[cfg(target_os = "windows")]
mod crosshair_win;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hex_colors() {
        assert_eq!(parse_hex_color("#4ade80"), Some((0x4a, 0xde, 0x80)));
        assert_eq!(parse_hex_color("4ADE80"), Some((0x4a, 0xde, 0x80)));
        assert_eq!(parse_hex_color("#fff"), Some((0xff, 0xff, 0xff)));
        assert_eq!(parse_hex_color("#000"), Some((0x00, 0x00, 0x00)));
        assert_eq!(parse_hex_color("zzz"), None);
        assert_eq!(parse_hex_color("#12345"), None);
        assert_eq!(parse_hex_color(""), None);
    }

    #[test]
    fn sanitizes_ranges_and_color() {
        let raw = CrosshairConfig {
            size: 500,
            gap: 99,
            thickness: 0,
            opacity: 1,
            color: "not-a-color".to_string(),
            ..Default::default()
        };
        let clean = raw.sanitized();
        assert_eq!(clean.size, 64);
        assert_eq!(clean.gap, 32);
        assert_eq!(clean.thickness, 1);
        assert_eq!(clean.opacity, 32);
        assert_eq!(clean.color, "#4ade80");
    }

    #[test]
    fn keeps_valid_config() {
        let raw = CrosshairConfig {
            preset: CrosshairPreset::Ring,
            size: 20,
            color: "#FF0000".to_string(),
            dot: true,
            ..Default::default()
        };
        let clean = raw.sanitized();
        assert_eq!(clean.preset, CrosshairPreset::Ring);
        assert_eq!(clean.color, "#ff0000");
        assert!(clean.dot);
    }

    #[test]
    fn deserializes_js_wire_config() {
        let config: CrosshairConfig = serde_json::from_str(
            r##"{"preset":"dot","size":8,"gap":0,"thickness":3,"color":"#ffffff","opacity":200,"dot":true,"outline":false,"enabled":true}"##,
        )
        .expect("wire config");
        assert_eq!(config.preset, CrosshairPreset::Dot);
        assert_eq!(config.opacity, 200);
    }

    #[test]
    fn rejects_unknown_preset_on_wire() {
        // serde отклонит неизвестный preset до sanitized() — контракт:
        // UI шлёт только cross|dot|ring|custom.
        let result: Result<CrosshairConfig, _> = serde_json::from_str(r#"{"preset":"x"}"#);
        assert!(result.is_err());
    }

    #[test]
    fn sanitizes_strokes() {
        let raw = CrosshairConfig {
            preset: CrosshairPreset::Custom,
            strokes: vec![
                Stroke {
                    points: vec![[500, -500], [0, 0]],
                },
                Stroke { points: vec![] },
            ],
            ..Default::default()
        };
        let clean = raw.sanitized();
        assert_eq!(clean.strokes.len(), 1);
        assert_eq!(clean.strokes[0].points, vec![[192, -192], [0, 0]]);
    }

    #[test]
    fn deserializes_wire_strokes() {
        let config: CrosshairConfig = serde_json::from_str(
            r##"{"preset":"custom","strokes":[{"points":[[-10,0],[10,0]]}]}"##,
        )
        .expect("wire strokes");
        assert_eq!(config.preset, CrosshairPreset::Custom);
        assert_eq!(config.strokes.len(), 1);
    }
}

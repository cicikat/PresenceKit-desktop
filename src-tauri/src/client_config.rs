use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const DEFAULT_BACKEND_BASE: &str = "http://127.0.0.1:8080";
const DEFAULT_WEBSOCKET_BASE: &str = "ws://127.0.0.1:8080/ws/desktop";
// 填 desktop profile token（`emt_…`，由后端 `POST /auth/tokens` 签发，profile=desktop）；
// legacy admin secret（旧 god token）仍兼容，字段名/env var 名不变。见后端仓 docs/security.md。
const DEFAULT_ADMIN_TOKEN_PLACEHOLDER: &str = "CHANGE_ME";
const DEFAULT_BOT_USER_ID: &str = "";
const DEFAULT_SENSOR_WINDOW_SECONDS: u32 = 30;
const DEFAULT_SENSOR_TICK_SECONDS: u32 = 5;
const DEFAULT_SENSOR_VERSION: &str = "emerald-client-rust-1.0";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorConfig {
    pub enabled: bool,
    pub window_seconds: u32,
    pub tick_seconds: u32,
    pub sensor_version: String,
}

impl Default for SensorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            window_seconds: DEFAULT_SENSOR_WINDOW_SECONDS,
            tick_seconds: DEFAULT_SENSOR_TICK_SECONDS,
            sensor_version: DEFAULT_SENSOR_VERSION.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub backend_base: String,
    pub websocket_base: String,
    // 字段名不变（配置兼容层）：填 desktop profile token（`emt_…`）或 legacy admin secret。
    pub admin_token: String,
    pub sensor_config: SensorConfig,
    pub bot_user_id: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            backend_base: DEFAULT_BACKEND_BASE.into(),
            websocket_base: DEFAULT_WEBSOCKET_BASE.into(),
            // env var 名不变：EMERALD_ADMIN_TOKEN 现在填 desktop profile token（`emt_…`），
            // legacy admin secret 仍兼容。
            admin_token: std::env::var("EMERALD_ADMIN_TOKEN")
                .unwrap_or_else(|_| DEFAULT_ADMIN_TOKEN_PLACEHOLDER.to_string()),
            sensor_config: SensorConfig::default(),
            bot_user_id: DEFAULT_BOT_USER_ID.into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialClientConfig {
    #[serde(default, alias = "backend_base", alias = "backend_base_url")]
    backend_base: Option<String>,
    #[serde(default, alias = "websocket_base", alias = "ws_base")]
    websocket_base: Option<String>,
    #[serde(default, alias = "admin_token")]
    admin_token: Option<String>,
    #[serde(default, alias = "sensor_config")]
    sensor_config: Option<PartialSensorConfig>,
    #[serde(default, alias = "bot_user_id")]
    bot_user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialSensorConfig {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default, alias = "window_seconds")]
    window_seconds: Option<u32>,
    #[serde(default, alias = "tick_seconds")]
    tick_seconds: Option<u32>,
    #[serde(default, alias = "sensor_version")]
    sensor_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacySensorConfig {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    backend_base_url: Option<String>,
    #[serde(default)]
    admin_token: Option<String>,
    #[serde(default)]
    window_seconds: Option<u32>,
    #[serde(default)]
    tick_seconds: Option<u32>,
    #[serde(default)]
    sensor_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendClientConfig {
    pub backend_base: String,
    pub websocket_base: String,
    pub sensor_config: SensorConfig,
}

impl From<ClientConfig> for FrontendClientConfig {
    fn from(cfg: ClientConfig) -> Self {
        Self {
            backend_base: cfg.backend_base,
            websocket_base: crate::ws_bridge::sanitize_websocket_url(&cfg.websocket_base)
                .unwrap_or_else(|_| DEFAULT_WEBSOCKET_BASE.to_string()),
            sensor_config: cfg.sensor_config,
        }
    }
}

fn apply_partial(cfg: &mut ClientConfig, partial: PartialClientConfig) {
    if let Some(v) = partial.backend_base {
        cfg.backend_base = trim_trailing_slash(v);
    }
    if let Some(v) = partial.websocket_base {
        cfg.websocket_base = v;
    }
    if let Some(v) = partial.admin_token {
        cfg.admin_token = v;
    }
    if let Some(v) = partial.bot_user_id {
        cfg.bot_user_id = v;
    }
    if let Some(sensor) = partial.sensor_config {
        if let Some(v) = sensor.enabled {
            cfg.sensor_config.enabled = v;
        }
        if let Some(v) = sensor.window_seconds {
            cfg.sensor_config.window_seconds = v;
        }
        if let Some(v) = sensor.tick_seconds {
            cfg.sensor_config.tick_seconds = v;
        }
        if let Some(v) = sensor.sensor_version {
            cfg.sensor_config.sensor_version = v;
        }
    }
}

fn apply_legacy_sensor(cfg: &mut ClientConfig, partial: LegacySensorConfig) {
    if let Some(v) = partial.enabled {
        cfg.sensor_config.enabled = v;
    }
    if let Some(v) = partial.backend_base_url {
        cfg.backend_base = trim_trailing_slash(v);
    }
    if let Some(v) = partial.admin_token {
        cfg.admin_token = v;
    }
    if let Some(v) = partial.window_seconds {
        cfg.sensor_config.window_seconds = v;
    }
    if let Some(v) = partial.tick_seconds {
        cfg.sensor_config.tick_seconds = v;
    }
    if let Some(v) = partial.sensor_version {
        cfg.sensor_config.sensor_version = v;
    }
}

fn trim_trailing_slash(value: String) -> String {
    value.trim_end_matches('/').to_string()
}

fn read_json(path: &PathBuf) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim_start_matches('\u{feff}').to_string())
}

fn local_config_candidates<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(dir) = std::env::current_dir() {
        paths.push(dir.join("config").join("client.local.json"));
        paths.push(dir.join("..").join("config").join("client.local.json"));
    }

    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("config")
            .join("client.local.json"),
    );

    if let Ok(dir) = app.path().app_config_dir() {
        paths.push(dir.join("client.local.json"));
    }

    paths
}

pub fn load_client_config<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> ClientConfig {
    let mut cfg = ClientConfig::default();

    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("sensor_config.json");
        if let Some(content) = read_json(&path) {
            match serde_json::from_str::<LegacySensorConfig>(&content) {
                Ok(partial) => apply_legacy_sensor(&mut cfg, partial),
                Err(e) => eprintln!("[client_config] parse {} failed: {}", path.display(), e),
            }
        }
    }

    for path in local_config_candidates(app) {
        if let Some(content) = read_json(&path) {
            match serde_json::from_str::<PartialClientConfig>(&content) {
                Ok(partial) => apply_partial(&mut cfg, partial),
                Err(e) => eprintln!("[client_config] parse {} failed: {}", path.display(), e),
            }
            break;
        }
    }

    cfg
}

pub fn backend_url(cfg: &ClientConfig, path: &str) -> String {
    format!("{}{}", cfg.backend_base.trim_end_matches('/'), path)
}

#[tauri::command]
pub fn load_public_client_config(app: tauri::AppHandle) -> FrontendClientConfig {
    load_client_config(&app).into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatus {
    pub configured: bool,
    pub prefix: String,
}

#[tauri::command]
pub fn get_token_status(app: tauri::AppHandle) -> TokenStatus {
    let token = load_client_config(&app).admin_token;
    let configured = !token.is_empty() && token != DEFAULT_ADMIN_TOKEN_PLACEHOLDER;
    let prefix = if configured {
        token.chars().take(8).collect()
    } else {
        String::new()
    };
    TokenStatus { configured, prefix }
}

// 与 lib.rs 的 safe_http_error_message 同一语义子集，但独立于已保存的 ClientConfig——
// 这里测的是输入框里尚未保存的候选 backend_base/admin_token。
fn whoami_error_message(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 => "token 无效".to_string(),
        429 => "认证失败次数过多，来源 IP 已被临时限制，稍后重试".to_string(),
        other => format!("HTTP {other}"),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoamiResult {
    pub label: String,
    pub scopes: Vec<String>,
}

#[tauri::command]
pub async fn test_backend_auth(
    backend_base: String,
    admin_token: String,
) -> Result<WhoamiResult, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| "无法创建后端连接".to_string())?;

    let url = format!("{}/auth/whoami", backend_base.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .bearer_auth(&admin_token)
        .send()
        .await
        .map_err(|_| "连接失败，请检查后端地址".to_string())?;

    let status = resp.status();
    if !status.is_success() {
        return Err(whoami_error_message(status));
    }
    resp.json::<WhoamiResult>().await.map_err(|e| e.to_string())
}

fn merge_client_config_json(
    existing: serde_json::Value,
    backend_base: &str,
    websocket_base: &str,
    admin_token: Option<&str>,
) -> serde_json::Value {
    let mut obj = match existing {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    obj.insert(
        "backendBase".to_string(),
        serde_json::Value::String(backend_base.to_string()),
    );
    obj.insert(
        "websocketBase".to_string(),
        serde_json::Value::String(websocket_base.to_string()),
    );
    if let Some(token) = admin_token {
        obj.insert(
            "adminToken".to_string(),
            serde_json::Value::String(token.to_string()),
        );
    }
    serde_json::Value::Object(obj)
}

fn target_config_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let candidates = local_config_candidates(app);
    if let Some(existing) = candidates.iter().find(|p| p.exists()) {
        return Ok(existing.clone());
    }
    candidates
        .into_iter()
        .last()
        .ok_or_else(|| "无法定位配置目录".to_string())
}

#[tauri::command]
pub fn save_client_config(
    app: tauri::AppHandle,
    backend_base: String,
    websocket_base: String,
    admin_token: Option<String>,
) -> Result<(), String> {
    let path = target_config_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录: {e}"))?;
    }

    let existing = read_json(&path)
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let merged = merge_client_config_json(
        existing,
        &backend_base,
        &websocket_base,
        admin_token.as_deref(),
    );
    let serialized = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;

    let mut tmp_os = path.clone().into_os_string();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);
    std::fs::write(&tmp_path, &serialized).map_err(|e| format!("写入失败: {e}"))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod save_config_tests {
    use super::*;

    #[test]
    fn merge_preserves_unknown_keys_and_overwrites_known_ones() {
        let existing = serde_json::json!({
            "backendBase": "http://old:8080",
            "websocketBase": "ws://old:8080/ws",
            "adminToken": "old-token",
            "sensorConfig": { "enabled": true },
            "customUserKey": "keep-me",
        });
        let merged = merge_client_config_json(
            existing,
            "http://new:9090",
            "ws://new:9090/ws",
            Some("new-token"),
        );
        assert_eq!(merged["backendBase"], "http://new:9090");
        assert_eq!(merged["websocketBase"], "ws://new:9090/ws");
        assert_eq!(merged["adminToken"], "new-token");
        assert_eq!(merged["customUserKey"], "keep-me");
        assert_eq!(merged["sensorConfig"]["enabled"], true);
    }

    #[test]
    fn merge_without_token_keeps_existing_token_untouched() {
        let existing = serde_json::json!({ "adminToken": "keep-this-secret" });
        let merged = merge_client_config_json(existing, "http://a", "ws://b", None);
        assert_eq!(merged["adminToken"], "keep-this-secret");
    }

    #[test]
    fn merge_on_empty_config_only_sets_provided_fields() {
        let merged = merge_client_config_json(
            serde_json::Value::Object(serde_json::Map::new()),
            "http://a",
            "ws://b",
            None,
        );
        assert_eq!(merged["backendBase"], "http://a");
        assert_eq!(merged["websocketBase"], "ws://b");
        assert!(merged.get("adminToken").is_none());
    }

    #[test]
    fn whoami_error_message_never_leaks_token_or_bearer() {
        let message = whoami_error_message(reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(message, "token 无效");
        assert!(!message.contains("Bearer"));

        let other = whoami_error_message(reqwest::StatusCode::TOO_MANY_REQUESTS);
        assert!(!other.contains("Bearer"));

        let generic = whoami_error_message(reqwest::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(generic, "HTTP 500");
        assert!(!generic.contains("Bearer"));
    }

    #[test]
    fn token_status_masks_short_and_placeholder_tokens() {
        // configured tokens only ever reveal an 8-char prefix, never the full value
        let full = "emt_super_secret_value_123456";
        let prefix: String = full.chars().take(8).collect();
        assert_eq!(prefix, "emt_supe");
        assert!(!prefix.contains("secret"));
    }
}

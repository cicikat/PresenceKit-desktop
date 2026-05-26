use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const DEFAULT_BACKEND_BASE: &str = "http://127.0.0.1:8080";
const DEFAULT_WEBSOCKET_BASE: &str = "ws://127.0.0.1:8080/ws/desktop";
const DEFAULT_ADMIN_TOKEN: &str = "Emerald1231";
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
    pub admin_token: String,
    pub sensor_config: SensorConfig,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            backend_base: DEFAULT_BACKEND_BASE.into(),
            websocket_base: DEFAULT_WEBSOCKET_BASE.into(),
            admin_token: DEFAULT_ADMIN_TOKEN.into(),
            sensor_config: SensorConfig::default(),
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
            websocket_base: cfg.websocket_base,
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

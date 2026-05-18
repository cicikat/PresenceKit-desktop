//! sensor 模块的运行时配置
//!
//! 默认值硬编码在这里,可被以下来源覆盖(优先级从低到高):
//! 1. 默认值(本文件常量)
//! 2. Tauri AppData 目录下 sensor_config.json(如存在)
//!
//! 用户禁用 sensor 的方法:在 AppData 目录创建
//! sensor_config.json 内容:{ "enabled": false }

use serde::Deserialize;
use tauri::Manager;

/// 默认后端地址。生产环境用户改为内网穿透域名时通过 sensor_config.json 覆盖
const DEFAULT_BACKEND_URL: &str = "http://127.0.0.1:8080";
const DEFAULT_ADMIN_TOKEN: &str = "Emerald1231";
const DEFAULT_WINDOW_SECONDS: u32 = 30;
const DEFAULT_TICK_SECONDS: u32 = 5;
const DEFAULT_SENSOR_VERSION: &str = "emerald-client-rust-1.0";

#[derive(Debug, Clone, Deserialize)]
struct PartialConfig {
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

#[derive(Debug, Clone)]
pub struct SensorConfig {
    pub enabled: bool,
    pub backend_base_url: String,
    pub admin_token: String,
    pub window_seconds: u32,
    pub tick_seconds: u32,
    pub sensor_version: String,
}

impl Default for SensorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            backend_base_url: DEFAULT_BACKEND_URL.into(),
            admin_token: DEFAULT_ADMIN_TOKEN.into(),
            window_seconds: DEFAULT_WINDOW_SECONDS,
            tick_seconds: DEFAULT_TICK_SECONDS,
            sensor_version: DEFAULT_SENSOR_VERSION.into(),
        }
    }
}

/// 从 AppData 目录加载 sensor_config.json,失败或不存在时返回默认值
pub fn load_sensor_config<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> SensorConfig {
    let mut cfg = SensorConfig::default();

    let path = match app.path().app_data_dir() {
        Ok(p) => p.join("sensor_config.json"),
        Err(_) => return cfg,
    };

    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return cfg, // 文件不存在/读不到 → 用默认值
    };

    let content = content.trim_start_matches('\u{feff}');

    let partial: PartialConfig = match serde_json::from_str(content) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[sensor_config] 解析 {} 失败: {}", path.display(), e);
            return cfg;
        }
    };

    if let Some(v) = partial.enabled {
        cfg.enabled = v;
    }
    if let Some(v) = partial.backend_base_url {
        cfg.backend_base_url = v;
    }
    if let Some(v) = partial.admin_token {
        cfg.admin_token = v;
    }
    if let Some(v) = partial.window_seconds {
        cfg.window_seconds = v;
    }
    if let Some(v) = partial.tick_seconds {
        cfg.tick_seconds = v;
    }
    if let Some(v) = partial.sensor_version {
        cfg.sensor_version = v;
    }

    cfg
}

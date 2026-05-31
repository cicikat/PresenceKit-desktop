// NOTE(endpoint-literals): 本文件中的后端路径（/desktop/chat、/memory/…、/garden/state、
// /diary/…、/chat-log/…、/mood/state、/activity/current、/sensor/realtime、/upload/ingest、
// /dream/state|enter|chat|exit|settings，共 15 个不同路径）均为字面量硬编码。
// publisher.rs 另有 /sensor/realtime。后端路由变更时需手动同步这两个文件。
mod actions;
mod client_config;
pub mod sensor;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::Engine;
use crate::client_config::{backend_url, load_client_config};
use crate::sensor::runner::{spawn_sensor_runner, SensorRunnerConfig, SensorRunnerHandle};
use tauri::Manager;

fn avatar_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("avatars");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn list_dream_fonts() -> Result<serde_json::Value, String> {
    let font_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "无法定位项目根目录".to_string())?
        .join("public")
        .join("fonts");

    if !font_dir.exists() {
        return Ok(serde_json::json!([]));
    }

    let mut fonts = Vec::new();
    for entry in fs::read_dir(&font_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(extension) = path.extension().and_then(|v| v.to_str()) else {
            continue;
        };
        if !matches!(extension.to_ascii_lowercase().as_str(), "ttf" | "otf" | "woff" | "woff2") {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        let label = path.file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or(file_name);
        fonts.push(serde_json::json!({
            "fileName": file_name,
            "label": label,
            "url": format!("/fonts/{}", file_name),
        }));
    }
    fonts.sort_by(|a, b| {
        a["fileName"].as_str().unwrap_or_default()
            .cmp(b["fileName"].as_str().unwrap_or_default())
    });
    Ok(serde_json::Value::Array(fonts))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn send_chat(app: tauri::AppHandle, message: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(backend_url(&cfg, "/desktop/chat"))
        .bearer_auth(&cfg.admin_token)
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_history(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let user_id = &cfg.bot_user_id;
    if user_id.is_empty() {
        return Ok(serde_json::json!({ "user_id": "", "history": [], "count": 0 }));
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = backend_url(&cfg, &format!("/memory/{}/short-term", user_id));
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("后端返回 {}", resp.status()));
    }

    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_garden_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/garden/state"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_diary_list(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/diary/list"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_diary_entry(app: tauri::AppHandle, date: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = backend_url(&cfg, &format!("/diary/{}", date));
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_chat_log_dates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/chat-log/dates"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_chat_log_day(app: tauri::AppHandle, date: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = backend_url(&cfg, &format!("/chat-log/{}", date));
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_mood_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/mood/state"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_activity_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/activity/current"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_sensor_realtime(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/sensor/realtime"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();

    if status.as_u16() == 404 {
        return Ok(serde_json::json!({ "_no_data": true }));
    }

    if !status.is_success() {
        return Err(format!("HTTP {}", status));
    }

    let val = resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    if val.is_null() {
        return Ok(serde_json::json!({ "_no_data": true }));
    }
    if matches!(val.as_object(), Some(map) if map.is_empty()) {
        return Ok(serde_json::json!({ "_no_data": true }));
    }

    Ok(val)
}

#[tauri::command]
async fn upload_document(
    app: tauri::AppHandle,
    file_path: String,
    message: String,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    // 1. 读文件 bytes
    let bytes = std::fs::read(&file_path).map_err(|e| format!("读文件失败: {}", e))?;

    // 2. 从 file_path 提取文件名(用于 multipart Part 的 file_name)
    let filename = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法解析文件名".to_string())?
        .to_string();

    // 3. 构造 multipart body
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone());

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("message", message)
        .text("channel", "desktop");

    // 4. 发请求(必须 no_proxy)
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(backend_url(&cfg, "/upload/ingest"))
        .bearer_auth(cfg.admin_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if !status.is_success() {
        // 分类错误码,前端按 status 数字处理文案
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status.as_u16(), body));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_avatar(app: tauri::AppHandle, role: String, image_b64: String) -> Result<String, String> {
    let dir = avatar_dir(&app)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let filename = format!("{}_{}.png", role, ts);
    let path = dir.join(&filename);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&image_b64)
        .map_err(|e| e.to_string())?;
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn load_avatar(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
async fn read_avatars_json(app: tauri::AppHandle) -> Result<String, String> {
    let json_path = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("avatars.json");
    if !json_path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&json_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_avatars_json(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json_path = dir.join("avatars.json");
    fs::write(&json_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_get_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .get(backend_url(&cfg, "/dream/state"))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_enter(app: tauri::AppHandle, entry_reason: Option<String>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let body = match entry_reason {
        Some(r) => serde_json::json!({ "entry_reason": r }),
        None    => serde_json::json!({}),
    };
    let resp = client
        .post(backend_url(&cfg, "/dream/enter"))
        .bearer_auth(&cfg.admin_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_chat(app: tauri::AppHandle, message: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .post(backend_url(&cfg, "/dream/chat"))
        .bearer_auth(&cfg.admin_token)
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_exit(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .post(backend_url(&cfg, "/dream/exit"))
        .bearer_auth(&cfg.admin_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_get_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let url = backend_url(&cfg, "/dream/settings");
    eprintln!("[dream_get_settings] GET {url}");
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    eprintln!("[dream_get_settings] status={}", status.as_u16());
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[dream_get_settings] error body: {body}");
        return Err(format!("HTTP {} — {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_update_settings(
    app: tauri::AppHandle,
    enable_dream_lorebook: Option<bool>,
    memory_access: Option<String>,
    boundary_level: Option<String>,
    world_layer: Option<String>,
    lucid_mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let url = backend_url(&cfg, "/dream/settings");
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let mut body = serde_json::Map::new();
    if let Some(v) = enable_dream_lorebook { body.insert("enable_dream_lorebook".into(), v.into()); }
    if let Some(v) = memory_access   { body.insert("memory_access".into(), v.into()); }
    if let Some(v) = boundary_level  { body.insert("boundary_level".into(), v.into()); }
    if let Some(v) = world_layer     { body.insert("world_layer".into(), v.into()); }
    if let Some(v) = lucid_mode      { body.insert("lucid_mode".into(), v.into()); }
    let body_json = serde_json::Value::Object(body);
    eprintln!("[dream_update_settings] PATCH {url}  body={body_json}");
    let resp = client
        .patch(&url)
        .bearer_auth(&cfg.admin_token)
        .json(&body_json)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    eprintln!("[dream_update_settings] status={}", status.as_u16());
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[dream_update_settings] error body: {body}");
        return Err(format!("HTTP {} — {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let cfg = load_client_config(app.handle());
            if cfg.sensor_config.enabled {
                match spawn_sensor_runner(SensorRunnerConfig {
                    backend_base_url: cfg.backend_base,
                    admin_token: cfg.admin_token,
                    window_seconds: cfg.sensor_config.window_seconds,
                    tick_seconds: cfg.sensor_config.tick_seconds,
                    sensor_version: cfg.sensor_config.sensor_version,
                }) {
                    Ok(handle) => {
                        app.manage(Mutex::<Option<SensorRunnerHandle>>::new(Some(handle)));
                        eprintln!("[lib] sensor runner 已启动");
                    }
                    Err(e) => {
                        eprintln!("[lib] sensor runner 启动失败: {e}");
                    }
                }
            } else {
                eprintln!("[lib] sensor runner 已被 config 禁用");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            actions::action_minimize_window,
            actions::action_open_url,
            actions::action_show_notify,
            actions::action_media_play_pause,
            client_config::load_public_client_config,
            greet,
            list_dream_fonts,
            send_chat,
            load_history,
            load_garden_state,
            load_diary_list,
            load_diary_entry,
            load_chat_log_dates,
            load_chat_log_day,
            load_mood_state,
            load_activity_state,
            load_sensor_realtime,
            upload_document,
            save_avatar,
            load_avatar,
            read_avatars_json,
            write_avatars_json,
            dream_get_state,
            dream_enter,
            dream_chat,
            dream_exit,
            dream_get_settings,
            dream_update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

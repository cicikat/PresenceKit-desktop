mod actions;
pub mod sensor;
mod sensor_config;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::Engine;
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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn send_chat(message: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("http://127.0.0.1:8080/desktop/chat")
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_history(user_id: String, token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("http://127.0.0.1:8080/memory/{}/short-term", user_id);
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("后端返回 {}", resp.status()));
    }

    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_garden_state(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/garden/state")
        .bearer_auth(token)
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
async fn load_diary_list(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/diary/list")
        .bearer_auth(token)
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
async fn load_diary_entry(date: String, token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("http://127.0.0.1:8080/diary/{}", date);
    let resp = client
        .get(&url)
        .bearer_auth(token)
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
async fn load_chat_log_dates(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/chat-log/dates")
        .bearer_auth(token)
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
async fn load_chat_log_day(date: String, token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("http://127.0.0.1:8080/chat-log/{}", date);
    let resp = client
        .get(&url)
        .bearer_auth(token)
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
async fn load_mood_state(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/mood/state")
        .bearer_auth(token)
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
async fn load_activity_state(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/activity/current")
        .bearer_auth(token)
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
async fn load_sensor_realtime(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://127.0.0.1:8080/sensor/realtime")
        .bearer_auth(token)
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
    file_path: String,
    message: String,
    token: String,
) -> Result<serde_json::Value, String> {
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
        .post("http://127.0.0.1:8080/upload/ingest")
        .bearer_auth(token)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let sensor_cfg = crate::sensor_config::load_sensor_config(app.handle());
            if sensor_cfg.enabled {
                match spawn_sensor_runner(SensorRunnerConfig {
                    backend_base_url: sensor_cfg.backend_base_url,
                    admin_token: sensor_cfg.admin_token,
                    window_seconds: sensor_cfg.window_seconds,
                    tick_seconds: sensor_cfg.tick_seconds,
                    sensor_version: sensor_cfg.sensor_version,
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
            greet,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

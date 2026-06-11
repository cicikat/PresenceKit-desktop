// NOTE(endpoint-literals): 本文件中的后端路径（/desktop/chat、/desktop/wake、/desktop/activate、
// /memory/…、/garden/state、/diary/…、/chat-log/…、/mood/state、/activity/current、
// /sensor/realtime、/upload/ingest、/dream/state|enter|chat|exit|settings、
// /settings/prompt-assets、/debug/user-hidden-state、
// /activity/reading/…(5)、/activity/gomoku/…(5)、/activity/chess/…(5)，共 34 个不同路径）均为字面量硬编码。
// publisher.rs 另有 /sensor/realtime。后端路由变更时需手动同步这两个文件。
mod actions;
mod client_config;
mod ws_bridge;
pub mod sensor;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::Engine;
use crate::client_config::{backend_url, load_client_config};
use crate::sensor::runner::{spawn_sensor_runner, SensorRunnerConfig, SensorRunnerHandle};
use tauri::Manager;

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|_| "无法创建后端连接".to_string())
}

fn authorized_request(
    cfg: &crate::client_config::ClientConfig,
    request: reqwest::RequestBuilder,
) -> reqwest::RequestBuilder {
    request.bearer_auth(&cfg.admin_token)
}

fn safe_http_error(status: reqwest::StatusCode) -> String {
    if matches!(status.as_u16(), 401 | 403) {
        "认证失败，请检查本地 token 配置".to_string()
    } else {
        format!("HTTP {}", status.as_u16())
    }
}

async fn require_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(safe_http_error(response.status()))
    }
}

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
    let client = http_client()?;

    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/upload/ingest")))
        .multipart(form)
        .send()
        .await
        .map_err(|_| "上传请求失败".to_string())?;

    let status = resp.status();
    if !status.is_success() {
        // 分类错误码,前端按 status 数字处理文案
        return Err(safe_http_error(status));
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
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/dream/state")))
        .send()
        .await
        .map_err(|_| "Dream state 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_enter(
    app: tauri::AppHandle,
    entry_reason: Option<String>,
    dream_mode: Option<String>,
    script_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    if let Some(v) = entry_reason { body.insert("entry_reason".into(), v.into()); }
    if let Some(v) = dream_mode { body.insert("dream_mode".into(), v.into()); }
    if let Some(v) = script_id { body.insert("script_id".into(), v.into()); }
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/enter")))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|_| "Dream enter 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_chat(app: tauri::AppHandle, message: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/chat")))
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|_| "Dream chat 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_exit(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/exit")))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "Dream exit 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_get_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let url = backend_url(&cfg, "/dream/settings");
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(&url))
        .send()
        .await
        .map_err(|_| "Dream settings 请求失败".to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(status));
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
    jailbreak_preset: Option<String>,
    display: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let url = backend_url(&cfg, "/dream/settings");
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    if let Some(v) = enable_dream_lorebook { body.insert("enable_dream_lorebook".into(), v.into()); }
    if let Some(v) = memory_access   { body.insert("memory_access".into(), v.into()); }
    if let Some(v) = boundary_level  { body.insert("boundary_level".into(), v.into()); }
    if let Some(v) = world_layer     { body.insert("world_layer".into(), v.into()); }
    if let Some(v) = lucid_mode      { body.insert("lucid_mode".into(), v.into()); }
    if let Some(v) = jailbreak_preset { body.insert("jailbreak_preset".into(), v.into()); }
    if let Some(v) = display         { body.insert("display".into(), v); }
    let body_json = serde_json::Value::Object(body);
    let resp = authorized_request(&cfg, client.patch(&url))
        .json(&body_json)
        .send()
        .await
        .map_err(|_| "Dream settings 更新失败".to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(status));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_prompt_assets(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .get(backend_url(&cfg, "/settings/prompt-assets"))
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
async fn patch_prompt_assets(
    app: tauri::AppHandle,
    active_character: Option<String>,
    enabled_lorebooks: Option<Vec<String>>,
    enabled_jailbreaks: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let mut body = serde_json::Map::new();
    if let Some(v) = active_character {
        body.insert("active_character".into(), v.into());
    }
    if let Some(v) = enabled_lorebooks {
        body.insert("enabled_lorebooks".into(), serde_json::Value::Array(v.into_iter().map(serde_json::Value::String).collect()));
    }
    if let Some(v) = enabled_jailbreaks {
        body.insert("enabled_jailbreaks".into(), serde_json::Value::Array(v.into_iter().map(serde_json::Value::String).collect()));
    }
    let body_json = serde_json::Value::Object(body);
    let resp = client
        .patch(backend_url(&cfg, "/settings/prompt-assets"))
        .bearer_auth(&cfg.admin_token)
        .json(&body_json)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {} — {}", status.as_u16(), body_text));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn desktop_wake(app: tauri::AppHandle, last_seen: Option<f64>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let body = if let Some(ts) = last_seen {
        serde_json::json!({ "last_seen": ts })
    } else {
        serde_json::json!({})
    };
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/desktop/wake")))
        .json(&body)
        .send()
        .await
        .map_err(|_| "Desktop wake 请求失败".to_string())?;
    if !resp.status().is_success() {
        return Err(safe_http_error(resp.status()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_hidden_state_debug(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(backend_url(&cfg, "/debug/user-hidden-state"))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    let mut hidden_state = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    // Keep the UI read-only: the panel still calls only load_hidden_state_debug,
    // and this command only performs GET requests. The display flag mirrors the
    // existing Dream developer-mode switch used by physiological_arousal.
    let show_hidden_fields = match client
        .get(backend_url(&cfg, "/dream/settings"))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
    {
        Ok(settings_resp) if settings_resp.status().is_success() => settings_resp
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|settings| {
                settings
                    .get("display")
                    .and_then(|display| display.get("physiological_arousal"))
                    .and_then(|value| value.as_bool())
            })
            .unwrap_or(false),
        _ => false,
    };

    if let Some(map) = hidden_state.as_object_mut() {
        map.insert(
            "display".into(),
            serde_json::json!({
                "physiological_arousal": show_hidden_fields,
            }),
        );
    }

    Ok(hidden_state)
}

#[tauri::command]
async fn get_character_avatar(app: tauri::AppHandle, char_id: String) -> Result<Option<String>, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let url = backend_url(&cfg, &format!("/settings/character-avatar/{}", char_id));
    let resp = client
        .get(&url)
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:{};base64,{}", content_type, b64)))
}

#[tauri::command]
async fn upload_character_avatar(
    app: tauri::AppHandle,
    char_id: String,
    data: Vec<u8>,
    content_type: String,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(data)
        .mime_str(&content_type)
        .map_err(|e| format!("invalid content-type: {}", e))?
        .file_name("avatar");

    let form = reqwest::multipart::Form::new().part("file", part);

    let url = backend_url(&cfg, &format!("/settings/characters/{}/avatar", char_id));
    let resp = client
        .post(&url)
        .bearer_auth(&cfg.admin_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {} — {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_character_avatar(
    app: tauri::AppHandle,
    char_id: String,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let url = backend_url(&cfg, &format!("/settings/characters/{}/avatar", char_id));
    let resp = client
        .delete(&url)
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {} — {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Activity helpers ──────────────────────────────────────────────────────────
// All activity HTTP calls go through Rust (same as every other API command),
// so they carry Bearer auth and avoid WebView CORS restrictions.

async fn activity_get(app: &tauri::AppHandle, path: &str) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .get(backend_url(&cfg, path))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

async fn activity_post(app: &tauri::AppHandle, path: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(app);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
    let resp = client
        .post(backend_url(&cfg, path))
        .bearer_auth(&cfg.admin_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status.as_u16(), body));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Activity payload structs ──────────────────────────────────────────────────
// Use structs (not bare params) so serde deserializes field names as-is
// (snake_case), avoiding Tauri's automatic camelCase conversion for bare params.

#[derive(serde::Deserialize)]
struct ActivitySessionPayload {
    session_id: String,
}

#[derive(serde::Deserialize, Debug)]
struct GomokuMovePayload {
    session_id: String,
    x: i64,
    y: i64,
}

#[derive(serde::Deserialize, Debug)]
struct GomokuChatPayload {
    session_id: String,
    message: String,
}

#[derive(serde::Deserialize)]
struct ChessMovePayload {
    session_id: String,
    uci: String,
}

#[derive(serde::Deserialize)]
struct ReadingPagePayload {
    session_id: String,
    page: i64,
}

#[derive(serde::Deserialize)]
struct ReadingTurnPagePayload {
    session_id: String,
    direction: String,
}

// ── Reading ───────────────────────────────────────────────────────────────────

#[tauri::command]
async fn activity_reading_start(app: tauri::AppHandle, file_path: String) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/reading/start", serde_json::json!({ "file_path": file_path })).await
}

#[tauri::command]
async fn activity_reading_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_get(&app, "/activity/reading/state").await
}

#[tauri::command]
async fn activity_reading_page(app: tauri::AppHandle, payload: ReadingPagePayload) -> Result<serde_json::Value, String> {
    let path = format!("/activity/reading/page?session_id={}&page={}", payload.session_id, payload.page);
    activity_get(&app, &path).await
}

#[tauri::command]
async fn activity_reading_turn_page(app: tauri::AppHandle, payload: ReadingTurnPagePayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/reading/turn_page", serde_json::json!({ "session_id": payload.session_id, "direction": payload.direction })).await
}

#[tauri::command]
async fn activity_reading_close(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/reading/close", serde_json::json!({ "session_id": payload.session_id })).await
}

// ── Gomoku ────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn activity_gomoku_start(app: tauri::AppHandle, opponent: Option<String>, ai_style: Option<String>) -> Result<serde_json::Value, String> {
    println!("[activity] rust command activity_gomoku_start opponent={:?} ai_style={:?}", opponent, ai_style);
    let actual_opponent = opponent.as_deref().unwrap_or("human");
    let body = if let Some(style) = &ai_style {
        serde_json::json!({"opponent": actual_opponent, "ai_style": style})
    } else {
        serde_json::json!({"opponent": actual_opponent})
    };
    println!("[activity] POST /activity/gomoku/start body={}", body);
    activity_post(&app, "/activity/gomoku/start", body).await
}

#[tauri::command]
async fn activity_gomoku_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_get(&app, "/activity/gomoku/state").await
}

#[tauri::command]
async fn activity_gomoku_move(app: tauri::AppHandle, payload: GomokuMovePayload) -> Result<serde_json::Value, String> {
    println!("[activity] rust command activity_gomoku_move {:?}", payload);
    activity_post(&app, "/activity/gomoku/move", serde_json::json!({ "session_id": payload.session_id, "x": payload.x, "y": payload.y })).await
}

#[tauri::command]
async fn activity_gomoku_close(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/gomoku/close", serde_json::json!({ "session_id": payload.session_id })).await
}

#[tauri::command]
async fn activity_gomoku_chat(app: tauri::AppHandle, payload: GomokuChatPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/gomoku/chat", serde_json::json!({ "session_id": payload.session_id, "message": payload.message })).await
}

// ── Chess ─────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn activity_chess_start(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/chess/start", serde_json::json!({})).await
}

#[tauri::command]
async fn activity_chess_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_get(&app, "/activity/chess/state").await
}

#[tauri::command]
async fn activity_chess_move(app: tauri::AppHandle, payload: ChessMovePayload) -> Result<serde_json::Value, String> {
    // backend MoveRequest uses "move" not "uci"
    activity_post(&app, "/activity/chess/move", serde_json::json!({ "session_id": payload.session_id, "move": payload.uci })).await
}

#[tauri::command]
async fn activity_chess_legal_moves(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    let path = format!("/activity/chess/legal_moves?session_id={}", payload.session_id);
    activity_get(&app, &path).await
}

#[tauri::command]
async fn activity_chess_close(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/chess/close", serde_json::json!({ "session_id": payload.session_id })).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            ws_bridge::register(app);
            let cfg = load_client_config(app.handle());

            // Phase 3: 启动后激活 desktop 通道（fire-and-forget，失败只 warning）
            let activate_url = backend_url(&cfg, "/desktop/activate");
            let activate_cfg = cfg.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(client) = reqwest::Client::builder().no_proxy().build() {
                    match authorized_request(&activate_cfg, client.post(&activate_url)).json(&serde_json::json!({})).send().await {
                        Ok(response) if response.status().is_success() => eprintln!("[lib] desktop_activate ok"),
                        Ok(response) => eprintln!("[lib] desktop_activate warning: {}", safe_http_error(response.status())),
                        Err(_) => eprintln!("[lib] desktop_activate warning: request failed"),
                    }
                }
            });

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
            ws_bridge::native_ws_connect,
            ws_bridge::native_ws_send,
            ws_bridge::native_ws_disconnect,
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
            get_prompt_assets,
            patch_prompt_assets,
            load_hidden_state_debug,
            desktop_wake,
            get_character_avatar,
            upload_character_avatar,
            delete_character_avatar,
            activity_reading_start,
            activity_reading_state,
            activity_reading_page,
            activity_reading_turn_page,
            activity_reading_close,
            activity_gomoku_start,
            activity_gomoku_state,
            activity_gomoku_move,
            activity_gomoku_close,
            activity_gomoku_chat,
            activity_chess_start,
            activity_chess_state,
            activity_chess_move,
            activity_chess_legal_moves,
            activity_chess_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod auth_tests {
    use super::*;
    use crate::client_config::{ClientConfig, SensorConfig};
    use reqwest::header::AUTHORIZATION;

    fn test_config() -> ClientConfig {
        ClientConfig {
            backend_base: "http://127.0.0.1:8080".to_string(),
            websocket_base: "ws://127.0.0.1:8080/ws/desktop".to_string(),
            admin_token: "secret-value".to_string(),
            sensor_config: SensorConfig::default(),
            bot_user_id: String::new(),
        }
    }

    #[test]
    fn protected_http_requests_use_bearer_header_without_url_leakage() {
        let cfg = test_config();
        let client = http_client().unwrap();
        let endpoints = [
            ("POST", "/desktop/wake"),
            ("POST", "/desktop/activate"),
            ("POST", "/upload/ingest"),
            ("POST", "/dream/enter"),
            ("POST", "/dream/chat"),
            ("POST", "/dream/exit"),
            ("GET", "/dream/state"),
            ("GET", "/dream/settings"),
            ("PATCH", "/dream/settings"),
        ];

        for (method, path) in endpoints {
            let builder = match method {
                "GET" => client.get(backend_url(&cfg, path)),
                "PATCH" => client.patch(backend_url(&cfg, path)),
                _ => client.post(backend_url(&cfg, path)),
            };
            let request = authorized_request(&cfg, builder).build().unwrap();
            assert_eq!(
                request.headers().get(AUTHORIZATION).unwrap(),
                "Bearer secret-value"
            );
            assert!(!request.url().as_str().contains("secret-value"));
            assert!(!request.url().as_str().contains("token="));
        }
    }

    #[test]
    fn auth_http_errors_are_safe() {
        for status in [reqwest::StatusCode::UNAUTHORIZED, reqwest::StatusCode::FORBIDDEN] {
            let message = safe_http_error(status);
            assert_eq!(message, "认证失败，请检查本地 token 配置");
            assert!(!message.contains("Bearer"));
            assert!(!message.contains("secret-value"));
        }
    }
}

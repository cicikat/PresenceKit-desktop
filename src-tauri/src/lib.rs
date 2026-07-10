// NOTE(endpoint-literals): 本文件中的后端路径（/desktop/chat、/desktop/wake、/desktop/activate、
// /memory/…、/garden/state、/diary/…、/chat-log/…、/mood/state、/activity/current、
// /sensor/realtime、/upload/ingest、/transcribe、/dream/state|enter|chat|exit|settings、
// /settings/prompt-assets、/debug/user-hidden-state、/hardware/devices|connect、
// /activity/reading/…(5)、/activity/gomoku/…(5)、/activity/chess/…(5)、
// /group/list|create|{id}|{id}/send|{id}/history|{id}/settings|{id}/roster(7)、
// /system/meta-mode、/lorebook(4)、/jailbreak-entries(4)、/settings/tool-loop、
// /settings/thinking，共 54 个不同路径）均为字面量硬编码。
// publisher.rs 另有 /sensor/realtime。后端路由变更时需手动同步这两个文件。
mod actions;
mod client_config;
mod ui_prefs;
mod ws_bridge;
pub mod sensor;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{atomic::AtomicBool, Mutex};
use base64::Engine;
use crate::client_config::{backend_url, load_client_config};
use crate::sensor::runner::{spawn_sensor_runner, SensorRunnerConfig, SensorRunnerHandle};
use tauri::{Emitter, Manager};

struct VoiceHotkeyState {
    running: AtomicBool,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| "无法创建后端连接".to_string())
}

// LLM-backed endpoints (chat, wake, dream chat/enter/exit) may wait >10s for inference.
fn llm_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| "无法创建后端连接".to_string())
}

fn authorized_request(
    cfg: &crate::client_config::ClientConfig,
    request: reqwest::RequestBuilder,
) -> reqwest::RequestBuilder {
    request.bearer_auth(&cfg.admin_token)
}

// 401 = token 无效；403 = token 有效但 scope 不足（后端语义，见 docs/security.md）。
// 403 的 detail 里含所需 scope，可以展示给用户；401/403 文案均不得包含 token 值。
fn safe_http_error_message(status: reqwest::StatusCode, detail: Option<&str>) -> String {
    match status.as_u16() {
        401 => "HTTP 401: 认证失败，请检查本地 token 配置".to_string(),
        403 => format!(
            "HTTP 403: token 权限不足（缺少 scope，检查该 token 的 profile 是否为 desktop）：{}",
            detail.unwrap_or("未知")
        ),
        429 => "HTTP 429: 认证失败次数过多，来源 IP 已被临时限制，稍后重试".to_string(),
        other => format!("HTTP {other}"),
    }
}

async fn safe_http_error(response: reqwest::Response) -> String {
    let status = response.status();
    let detail = if status.as_u16() == 403 {
        response
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(|s| s.to_string()))
    } else {
        None
    };
    safe_http_error_message(status, detail.as_deref())
}

async fn require_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(safe_http_error(response).await)
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

fn is_known_avatar_role(role: &str) -> bool {
    matches!(
        role,
        "her" | "you" | "dream_background_day" | "dream_background_night" | "chat_background"
    )
}

fn is_generated_avatar_for_role(file_name: &str, role: &str) -> bool {
    let Some(timestamp) = file_name
        .strip_prefix(role)
        .and_then(|value| value.strip_prefix('_'))
        .and_then(|value| value.strip_suffix(".png"))
    else {
        return false;
    };
    !timestamp.is_empty() && timestamp.bytes().all(|byte| byte.is_ascii_digit())
}

fn cleanup_old_generated_avatars(dir: &Path, role: &str, keep_path: &Path) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path == keep_path || !path.is_file() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if is_generated_avatar_for_role(file_name, role) {
            if let Err(error) = fs::remove_file(&path) {
                eprintln!(
                    "[avatar] 无法清理同用途旧头像 {}: {error}",
                    path.display()
                );
            }
        }
    }
    Ok(())
}

fn dream_fonts_dev_dir() -> Result<PathBuf, String> {
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "无法定位项目根目录".to_string())?
        .join("public")
        .join("fonts"))
}

fn dream_fonts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut checked = Vec::new();

    match app.path().resource_dir() {
        Ok(resource_dir) => {
            let font_dir = resource_dir.join("fonts");
            if font_dir.is_dir() {
                return Ok(font_dir);
            }
            checked.push(font_dir);
        }
        Err(error) => {
            eprintln!("[dream_fonts] 无法定位运行期资源目录: {error}");
        }
    }

    if cfg!(debug_assertions) {
        let dev_dir = dream_fonts_dev_dir()?;
        if dev_dir.is_dir() {
            eprintln!(
                "[dream_fonts] 运行期字体资源不可用，使用开发环境 fallback: {}",
                dev_dir.display()
            );
            return Ok(dev_dir);
        }
        checked.push(dev_dir);
    }

    let checked_paths = checked
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let message = format!("无法定位 Dream 字体目录，已检查: {checked_paths}");
    eprintln!("[dream_fonts] {message}");
    Err(message)
}

fn list_dream_fonts_in_dir(font_dir: &Path) -> Result<serde_json::Value, String> {
    let mut fonts = Vec::new();
    for entry in fs::read_dir(font_dir)
        .map_err(|e| format!("无法读取 Dream 字体目录 {}: {e}", font_dir.display()))?
    {
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
fn list_dream_fonts(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let font_dir = dream_fonts_dir(&app)?;
    list_dream_fonts_in_dir(&font_dir)
}

fn themes_dev_dir() -> Result<PathBuf, String> {
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "无法定位项目根目录".to_string())?
        .join("public")
        .join("themes"))
}

fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut checked = Vec::new();

    match app.path().resource_dir() {
        Ok(resource_dir) => {
            let theme_dir = resource_dir.join("themes");
            if theme_dir.is_dir() {
                return Ok(theme_dir);
            }
            checked.push(theme_dir);
        }
        Err(error) => eprintln!("[themes] 无法定位运行期资源目录: {error}"),
    }

    if cfg!(debug_assertions) {
        let dev_dir = themes_dev_dir()?;
        if dev_dir.is_dir() {
            eprintln!(
                "[themes] 运行期主题资源不可用，使用开发环境 fallback: {}",
                dev_dir.display()
            );
            return Ok(dev_dir);
        }
        checked.push(dev_dir);
    }

    let checked_paths = checked
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let message = format!("无法定位主题目录，已检查: {checked_paths}");
    eprintln!("[themes] {message}");
    Err(message)
}

fn list_themes_in_dir(theme_dir: &Path) -> Result<serde_json::Value, String> {
    let mut themes = Vec::new();
    for entry in fs::read_dir(theme_dir)
        .map_err(|e| format!("无法读取主题目录 {}: {e}", theme_dir.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("theme.json");
        if !manifest_path.is_file() {
            continue;
        }
        match fs::read_to_string(&manifest_path)
            .map_err(|e| e.to_string())
            .and_then(|raw| {
                serde_json::from_str::<serde_json::Value>(&raw).map_err(|e| e.to_string())
            }) {
            Ok(value) if value.is_object() => themes.push(value),
            Ok(_) => eprintln!("[themes] 忽略非对象 manifest: {}", manifest_path.display()),
            Err(error) => eprintln!(
                "[themes] 忽略无法解析的 manifest {}: {error}",
                manifest_path.display()
            ),
        }
    }
    themes.sort_by(|a, b| {
        a["id"]
            .as_str()
            .unwrap_or_default()
            .cmp(b["id"].as_str().unwrap_or_default())
    });
    Ok(serde_json::Value::Array(themes))
}

#[tauri::command]
fn list_themes(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let theme_dir = themes_dir(&app)?;
    list_themes_in_dir(&theme_dir)
}

fn room_assets_dir(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    let mut checked = Vec::new();

    match app.path().resource_dir() {
        Ok(resource_dir) => {
            let dir = resource_dir.join("room").join(kind);
            if dir.is_dir() {
                return Ok(dir);
            }
            checked.push(dir);
        }
        Err(error) => eprintln!("[room_assets] 无法定位运行期资源目录: {error}"),
    }

    if cfg!(debug_assertions) {
        let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "无法定位项目根目录".to_string())?
            .join("public")
            .join("room")
            .join(kind);
        if dev_dir.is_dir() {
            return Ok(dev_dir);
        }
        checked.push(dev_dir);
    }

    let checked_paths = checked
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!("无法定位 room/{kind} 资源目录，已检查: {checked_paths}"))
}

#[tauri::command]
fn list_room_assets(app: tauri::AppHandle, kind: String) -> Result<serde_json::Value, String> {
    if kind != "character" && kind != "scene" {
        return Err(format!("无效的 kind 参数 '{kind}'，仅接受 character|scene"));
    }
    let dir = room_assets_dir(&app, &kind)?;
    let mut assets = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|e| format!("无法读取目录 {}: {e}", dir.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|v| v.to_str()) else {
            continue;
        };
        if !matches!(ext.to_ascii_lowercase().as_str(), "glb" | "gltf") {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        let label = path.file_stem().and_then(|v| v.to_str()).unwrap_or(file_name);
        assets.push(serde_json::json!({ "fileName": file_name, "label": label }));
    }
    assets.sort_by(|a, b| {
        a["fileName"].as_str().unwrap_or_default()
            .cmp(b["fileName"].as_str().unwrap_or_default())
    });
    Ok(serde_json::Value::Array(assets))
}

#[tauri::command]
fn list_room_props(app: tauri::AppHandle, category: Option<String>) -> Result<serde_json::Value, String> {
    let props_dir = match room_assets_dir(&app, "props") {
        Ok(dir) => dir,
        Err(_) => return Ok(serde_json::json!([])),
    };

    match category {
        None => {
            // List subdirectories as categories
            let mut categories = Vec::new();
            for entry in fs::read_dir(&props_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if !path.is_dir() { continue; }
                let Some(name) = path.file_name().and_then(|v| v.to_str()) else { continue; };
                categories.push(serde_json::json!({ "category": name }));
            }
            categories.sort_by(|a, b| {
                a["category"].as_str().unwrap_or("").cmp(b["category"].as_str().unwrap_or(""))
            });
            Ok(serde_json::Value::Array(categories))
        }
        Some(cat) => {
            // Validate no path traversal
            if cat.contains('/') || cat.contains('\\') || cat.starts_with('.') {
                return Err(format!("无效的 category 名称: {cat}"));
            }
            let target = if cat.is_empty() {
                props_dir.clone()
            } else {
                props_dir.join(&cat)
            };
            if !target.is_dir() {
                return Ok(serde_json::json!([]));
            }
            let mut assets = Vec::new();
            for entry in fs::read_dir(&target).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if !path.is_file() { continue; }
                let Some(ext) = path.extension().and_then(|v| v.to_str()) else { continue; };
                if !matches!(ext.to_ascii_lowercase().as_str(), "glb" | "gltf") { continue; }
                let Some(file_name) = path.file_name().and_then(|v| v.to_str()) else { continue; };
                let label = path.file_stem().and_then(|v| v.to_str()).unwrap_or(file_name);
                let file = if cat.is_empty() {
                    file_name.to_string()
                } else {
                    format!("{}/{}", cat, file_name)
                };
                assets.push(serde_json::json!({ "file": file, "label": label, "category": cat }));
            }
            assets.sort_by(|a, b| {
                a["file"].as_str().unwrap_or("").cmp(b["file"].as_str().unwrap_or(""))
            });
            Ok(serde_json::Value::Array(assets))
        }
    }
}

fn live2d_models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut checked = Vec::new();

    match app.path().resource_dir() {
        Ok(resource_dir) => {
            let dir = resource_dir.join("live2d").join("models");
            if dir.is_dir() {
                return Ok(dir);
            }
            checked.push(dir);
        }
        Err(error) => eprintln!("[live2d_assets] 无法定位运行期资源目录: {error}"),
    }

    if cfg!(debug_assertions) {
        let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "无法定位项目根目录".to_string())?
            .join("public")
            .join("live2d")
            .join("models");
        if dev_dir.is_dir() {
            return Ok(dev_dir);
        }
        checked.push(dev_dir);
    }

    let checked_paths = checked
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!("无法定位 live2d/models 资源目录，已检查: {checked_paths}"))
}

#[tauri::command]
fn list_live2d_models(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = match live2d_models_dir(&app) {
        Ok(dir) => dir,
        Err(message) => {
            // Missing `live2d/models/` is an expected fresh-install state, not a hard error —
            // degrade to an empty list so the settings UI can show a placement hint instead of
            // an error banner. The checked-paths detail still goes to the log for debugging.
            eprintln!("[live2d_assets] {message}");
            return Ok(serde_json::json!([]));
        }
    };

    let mut models = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("无法读取目录 {}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(dir_name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };

        let mut candidates: Vec<String> = Vec::new();
        if let Ok(sub_entries) = fs::read_dir(&path) {
            for sub in sub_entries.flatten() {
                let sub_path = sub.path();
                if !sub_path.is_file() {
                    continue;
                }
                let Some(name) = sub_path.file_name().and_then(|v| v.to_str()) else {
                    continue;
                };
                if name.ends_with(".model3.json") {
                    candidates.push(name.to_string());
                }
            }
        }
        candidates.sort();
        let Some(model_json) = candidates.into_iter().next() else {
            continue;
        };

        models.push(serde_json::json!({
            "dirName": dir_name,
            "modelJson": model_json,
            "label": dir_name,
        }));
    }
    models.sort_by(|a, b| {
        a["dirName"].as_str().unwrap_or_default()
            .cmp(b["dirName"].as_str().unwrap_or_default())
    });
    Ok(serde_json::Value::Array(models))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn send_chat(app: tauri::AppHandle, message: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = llm_http_client()?;

    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/desktop/chat")))
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(safe_http_error(resp).await);
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
    let client = http_client()?;

    let url = backend_url(&cfg, &format!("/memory/{}/short-term", user_id));
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_garden_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let resp = client
        .get(backend_url(&cfg, "/garden/state"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_diary_list(app: tauri::AppHandle, char_id: Option<String>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let base = backend_url(&cfg, "/diary/list");
    let url = match char_id.as_deref() {
        Some(cid) if !cid.is_empty() => format!("{}?char_id={}", base, cid),
        _ => base,
    };
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_diary_entry(app: tauri::AppHandle, date: String, char_id: Option<String>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let base = backend_url(&cfg, &format!("/diary/{}", date));
    let url = match char_id.as_deref() {
        Some(cid) if !cid.is_empty() => format!("{}?char_id={}", base, cid),
        _ => base,
    };
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_chat_log_dates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let resp = client
        .get(backend_url(&cfg, "/chat-log/dates"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_chat_log_day(app: tauri::AppHandle, date: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let url = backend_url(&cfg, &format!("/chat-log/{}", date));
    let resp = client
        .get(&url)
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_mood_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let resp = client
        .get(backend_url(&cfg, "/mood/state"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_activity_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let resp = client
        .get(backend_url(&cfg, "/activity/current"))
        .bearer_auth(cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_sensor_realtime(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

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
        return Err(format!("HTTP {}", status.as_u16()));
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
        return Err(safe_http_error(resp).await);
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn transcribe_audio(app: tauri::AppHandle, audio_b64: String) -> Result<serde_json::Value, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&audio_b64)
        .map_err(|_| "HTTP 422: base64 解码失败".to_string())?;

    let cfg = load_client_config(&app);
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("recording.webm")
        .mime_str("audio/webm")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("channel", "desktop");

    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/transcribe")))
        .multipart(form)
        .send()
        .await
        .map_err(|_| "HTTP 0: 转写请求失败".to_string())?;

    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(resp).await);
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_voice_hotkey_listener(app: tauri::AppHandle) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<VoiceHotkeyState>();
    if state.running.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Ok(());
    }
    std::thread::Builder::new()
        .name("voice-hotkey-poll".into())
        .spawn(move || {
            use device_query::{DeviceQuery, DeviceState, Keycode};
            let device = DeviceState::new();
            let mut was_active = false;
            loop {
                let keys = device.get_keys();
                let active = (keys.contains(&Keycode::LAlt) || keys.contains(&Keycode::RAlt))
                    && keys.contains(&Keycode::Key1);
                if active && !was_active {
                    let _ = app.emit("voice-hotkey", ());
                }
                was_active = active;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_avatar(app: tauri::AppHandle, role: String, image_b64: String) -> Result<String, String> {
    if !is_known_avatar_role(&role) {
        return Err("不支持的头像用途".to_string());
    }
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
    if let Err(error) = cleanup_old_generated_avatars(&dir, &role, &path) {
        eprintln!("[avatar] 无法扫描同用途旧头像: {error}");
    }
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
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("写入失败 {path}: {e}"))
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
async fn hardware_get_devices(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/hardware/devices")))
        .send()
        .await
        .map_err(|_| "Hardware devices 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn hardware_connect(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    // Intiface scan + connect can take a couple seconds; use the longer client.
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/hardware/connect")))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "Hardware connect 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_get_stats(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/dream/stats")))
        .send()
        .await
        .map_err(|_| "Dream stats 请求失败".to_string())?;
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
    let client = llm_http_client()?;
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
    let client = llm_http_client()?;
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
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/exit")))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "Dream exit 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_wake(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/wake")))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "Dream wake 请求失败".to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn dream_resume(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/dream/resume")))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "Dream resume 请求失败".to_string())?;
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
        return Err(safe_http_error(resp).await);
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
    jailbreak_presets: Option<Vec<String>>,
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
    if let Some(v) = jailbreak_presets { body.insert("jailbreak_presets".into(), serde_json::json!(v)); }
    if let Some(v) = display         { body.insert("display".into(), v); }
    let body_json = serde_json::Value::Object(body);
    let resp = authorized_request(&cfg, client.patch(&url))
        .json(&body_json)
        .send()
        .await
        .map_err(|_| "Dream settings 更新失败".to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(resp).await);
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_prompt_assets(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = client
        .get(backend_url(&cfg, "/settings/prompt-assets"))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(safe_http_error(resp).await);
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
    let client = http_client()?;
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
    let client = llm_http_client()?;
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
        return Err(safe_http_error(resp).await);
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_hidden_state_debug(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

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
    let client = http_client()?;
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
    let client = http_client()?;

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
    let client = http_client()?;
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
    let client = http_client()?;
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
    let client = http_client()?;
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

#[derive(serde::Deserialize, Debug)]
struct DreamSeedChatPayload {
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
    let cfg = load_client_config(&app);

    let bytes = std::fs::read(&file_path).map_err(|e| format!("读文件失败: {}", e))?;

    let filename = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法解析文件名".to_string())?
        .to_string();

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename);
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("start_page", "1");

    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/activity/reading/start")))
        .multipart(form)
        .send()
        .await
        .map_err(|_| "上传请求失败".to_string())?;

    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(resp).await);
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
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

#[tauri::command]
async fn activity_gomoku_ai_move(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/gomoku/ai_move", serde_json::json!({ "session_id": payload.session_id })).await
}

// ── Chess ─────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn activity_chess_start(
    app: tauri::AppHandle,
    opponent: Option<String>,
    ai_style: Option<String>,
) -> Result<serde_json::Value, String> {
    let actual_opponent = opponent.as_deref().unwrap_or("human");
    let body = if let Some(style) = &ai_style {
        serde_json::json!({"opponent": actual_opponent, "ai_style": style})
    } else {
        serde_json::json!({"opponent": actual_opponent})
    };
    activity_post(&app, "/activity/chess/start", body).await
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

#[tauri::command]
async fn activity_chess_chat(app: tauri::AppHandle, payload: GomokuChatPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/chess/chat", serde_json::json!({ "session_id": payload.session_id, "message": payload.message })).await
}

#[tauri::command]
async fn activity_chess_ai_move(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/chess/ai_move", serde_json::json!({ "session_id": payload.session_id })).await
}

#[tauri::command]
async fn activity_reading_chat(app: tauri::AppHandle, payload: GomokuChatPayload) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/reading/chat", serde_json::json!({ "session_id": payload.session_id, "message": payload.message })).await
}

#[tauri::command]
async fn activity_reading_library(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_get(&app, "/activity/reading/library").await
}

#[tauri::command]
async fn activity_reading_add_book(app: tauri::AppHandle, file_path: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);

    let bytes = std::fs::read(&file_path).map_err(|e| format!("读文件失败: {}", e))?;

    let filename = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法解析文件名".to_string())?
        .to_string();

    let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
    let form = reqwest::multipart::Form::new().part("file", part);

    let client = http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/activity/reading/library/add")))
        .multipart(form)
        .send()
        .await
        .map_err(|_| "上传请求失败".to_string())?;

    let status = resp.status();
    if !status.is_success() {
        return Err(safe_http_error(resp).await);
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct ReadingStartFromLibraryPayload {
    book_id: String,
    start_page: Option<i64>,
}

#[tauri::command]
async fn activity_reading_start_from_library(app: tauri::AppHandle, payload: ReadingStartFromLibraryPayload) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let body = serde_json::json!({
        "book_id": payload.book_id,
        "start_page": payload.start_page.unwrap_or(1),
    });
    let client = llm_http_client()?;
    let resp = client
        .post(backend_url(&cfg, "/activity/reading/start_from_library"))
        .bearer_auth(&cfg.admin_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status.as_u16(), body_text));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct ReadingDeleteBookPayload {
    book_id: String,
    with_insights: Option<bool>,
}

#[tauri::command]
async fn activity_reading_delete_book(app: tauri::AppHandle, payload: ReadingDeleteBookPayload) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "book_id": payload.book_id,
        "with_insights": payload.with_insights.unwrap_or(false),
    });
    activity_post(&app, "/activity/reading/library/delete", body).await
}

#[derive(serde::Deserialize)]
struct ReadingRenameBookPayload {
    book_id: String,
    title: String,
}

#[tauri::command]
async fn activity_reading_rename_book(app: tauri::AppHandle, payload: ReadingRenameBookPayload) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "book_id": payload.book_id,
        "title": payload.title,
    });
    activity_post(&app, "/activity/reading/library/rename", body).await
}

#[derive(serde::Deserialize)]
struct ReadingCategorizeBookPayload {
    book_id: String,
    category: String,
}

#[tauri::command]
async fn activity_reading_categorize_book(app: tauri::AppHandle, payload: ReadingCategorizeBookPayload) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "book_id": payload.book_id,
        "category": payload.category,
    });
    activity_post(&app, "/activity/reading/library/categorize", body).await
}

// ── Group Chat ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn group_list(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/group/list")))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_create(
    app: tauri::AppHandle,
    roster: Vec<String>,
    domain: String,
    settings: Option<serde_json::Value>,
    group_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    body.insert("roster".into(), serde_json::json!(roster));
    body.insert("domain".into(), domain.into());
    if let Some(v) = settings { body.insert("settings".into(), v); }
    if let Some(v) = group_id { body.insert("group_id".into(), v.into()); }
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/group/create")))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_get(app: tauri::AppHandle, id: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}", id));
    let resp = authorized_request(&cfg, client.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_send(app: tauri::AppHandle, id: String, message: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}/send", id));
    let resp = authorized_request(&cfg, client.post(&url))
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_history(app: tauri::AppHandle, id: String, before: Option<f64>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let path = if let Some(ts) = before {
        format!("/group/{}/history?before={}", id, ts)
    } else {
        format!("/group/{}/history", id)
    };
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, &path)))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_settings_get(app: tauri::AppHandle, id: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}/settings", id));
    let resp = authorized_request(&cfg, client.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_settings_patch(app: tauri::AppHandle, id: String, settings: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}/settings", id));
    let resp = authorized_request(&cfg, client.patch(&url))
        .json(&settings)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn group_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}", id));
    let resp = authorized_request(&cfg, client.delete(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    Ok(())
}

#[tauri::command]
async fn group_patch_roster(app: tauri::AppHandle, id: String, roster: Vec<String>) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/group/{}/roster", id));
    let resp = authorized_request(&cfg, client.patch(&url))
        .json(&serde_json::json!({ "roster": roster }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(safe_http_error(resp).await); }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Meta Mode ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_meta_mode(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/system/meta-mode")))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn patch_meta_mode(
    app: tauri::AppHandle,
    mode: String,
    ttl_seconds: Option<u64>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    body.insert("mode".into(), mode.into());
    if let Some(ttl) = ttl_seconds {
        body.insert("ttl_seconds".into(), ttl.into());
    }
    let resp = authorized_request(&cfg, client.patch(backend_url(&cfg, "/system/meta-mode")))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn patch_presence_nag(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.put(backend_url(&cfg, "/scheduler/config")))
        .json(&serde_json::json!({ "presence_nag": enabled }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn patch_proactive_gap(app: tauri::AppHandle, hours: f64) -> Result<(), String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.put(backend_url(&cfg, "/scheduler/config")))
        .json(&serde_json::json!({ "global_proactive_min_gap_hours": hours }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    require_success(resp).await.map(|_| ())
}

#[tauri::command]
async fn get_proactive_gap_hours(app: tauri::AppHandle) -> Result<f64, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/scheduler/config")))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let secs = body.get("global_proactive_min_gap_seconds")
        .and_then(|v| v.as_f64())
        .unwrap_or(2700.0);
    Ok(secs / 3600.0)
}

// ── Chat Settings ────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_chat_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;

    let mode_resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/chat-mode")))
        .send().await.map_err(|e| e.to_string())?;
    let mode_resp = require_success(mode_resp).await?;
    let mode_val: serde_json::Value = mode_resp.json().await.map_err(|e| e.to_string())?;

    let style_resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/chat-style")))
        .send().await.map_err(|e| e.to_string())?;
    let style_resp = require_success(style_resp).await?;
    let style_val: serde_json::Value = style_resp.json().await.map_err(|e| e.to_string())?;

    let multi_resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/chat-multi-message")))
        .send().await.map_err(|e| e.to_string())?;
    let multi_resp = require_success(multi_resp).await?;
    let multi_val: serde_json::Value = multi_resp.json().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "mode": mode_val.get("mode").and_then(|v| v.as_str()).unwrap_or("chat"),
        "style": style_val.get("style").and_then(|v| v.as_str()).unwrap_or("roleplay"),
        "multi_message": multi_val.get("multi_message").and_then(|v| v.as_bool()).unwrap_or(false),
    }))
}

#[tauri::command]
async fn set_chat_mode(app: tauri::AppHandle, mode: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.put(backend_url(&cfg, "/chat-mode")))
        .json(&serde_json::json!({ "mode": mode }))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_chat_style(app: tauri::AppHandle, style: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.put(backend_url(&cfg, "/chat-style")))
        .json(&serde_json::json!({ "style": style }))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_chat_multi_message(app: tauri::AppHandle, enabled: bool) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.put(backend_url(&cfg, "/chat-multi-message")))
        .json(&serde_json::json!({ "enabled": enabled }))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Tool Loop (cc-tasks/16) ────────────────────────────────────────────────────

#[tauri::command]
async fn get_tool_loop_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/settings/tool-loop")))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_tool_loop_settings(
    app: tauri::AppHandle,
    enabled: Option<bool>,
    max_steps: Option<u32>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    if let Some(v) = enabled {
        body.insert("enabled".into(), v.into());
    }
    if let Some(v) = max_steps {
        body.insert("max_steps".into(), v.into());
    }
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/settings/tool-loop")))
        .json(&serde_json::Value::Object(body))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Thinking (cc-tasks/17) ──────────────────────────────────────────────────────

#[tauri::command]
async fn get_thinking_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/settings/thinking")))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_thinking_settings(
    app: tauri::AppHandle,
    enabled: Option<bool>,
    mode: Option<String>,
    apply_to_proactive: Option<bool>,
) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let mut body = serde_json::Map::new();
    if let Some(v) = enabled {
        body.insert("enabled".into(), v.into());
    }
    if let Some(v) = mode {
        body.insert("mode".into(), v.into());
    }
    if let Some(v) = apply_to_proactive {
        body.insert("apply_to_proactive".into(), v.into());
    }
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/settings/thinking")))
        .json(&serde_json::Value::Object(body))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Dream Seed ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn activity_dream_seed_start(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_post(&app, "/activity/dream_seed/start", serde_json::json!({})).await
}

#[tauri::command]
async fn activity_dream_seed_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    activity_get(&app, "/activity/dream_seed/state").await
}

#[tauri::command]
async fn activity_dream_seed_chat(app: tauri::AppHandle, payload: DreamSeedChatPayload) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/activity/dream_seed/chat")))
        .json(&serde_json::json!({ "session_id": payload.session_id, "message": payload.message }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn activity_dream_seed_close(app: tauri::AppHandle, payload: ActivitySessionPayload) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = llm_http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/activity/dream_seed/close")))
        .json(&serde_json::json!({ "session_id": payload.session_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Lorebook entry CRUD ───────────────────────────────────────────────────────

#[tauri::command]
async fn get_lorebook_entries(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/lorebook")))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_lorebook_entry(app: tauri::AppHandle, entry: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/lorebook")))
        .json(&entry).send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_lorebook_entry(app: tauri::AppHandle, eid: String, entry: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/lorebook/{}", eid));
    let resp = authorized_request(&cfg, client.put(&url))
        .json(&entry).send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_lorebook_entry(app: tauri::AppHandle, eid: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/lorebook/{}", eid));
    let resp = authorized_request(&cfg, client.delete(&url))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// ── Jailbreak entry CRUD ──────────────────────────────────────────────────────

#[tauri::command]
async fn get_jailbreak_entries(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.get(backend_url(&cfg, "/jailbreak-entries")))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_jailbreak_entry(app: tauri::AppHandle, entry: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let resp = authorized_request(&cfg, client.post(backend_url(&cfg, "/jailbreak-entries")))
        .json(&entry).send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_jailbreak_entry(app: tauri::AppHandle, eid: String, entry: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/jailbreak-entries/{}", eid));
    let resp = authorized_request(&cfg, client.put(&url))
        .json(&entry).send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_jailbreak_entry(app: tauri::AppHandle, eid: String) -> Result<serde_json::Value, String> {
    let cfg = load_client_config(&app);
    let client = http_client()?;
    let url = backend_url(&cfg, &format!("/jailbreak-entries/{}", eid));
    let resp = authorized_request(&cfg, client.delete(&url))
        .send().await.map_err(|e| e.to_string())?;
    let resp = require_success(resp).await?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VoiceHotkeyState { running: AtomicBool::new(false) })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            ws_bridge::register(app);
            let cfg = load_client_config(app.handle());

            // Phase 3: 启动后激活 desktop 通道（fire-and-forget，失败只 warning）
            let activate_url = backend_url(&cfg, "/desktop/activate");
            let activate_cfg = cfg.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(client) = http_client() {
                    match authorized_request(&activate_cfg, client.post(&activate_url)).json(&serde_json::json!({})).send().await {
                        Ok(response) if response.status().is_success() => eprintln!("[lib] desktop_activate ok"),
                        Ok(response) => eprintln!("[lib] desktop_activate warning: {}", safe_http_error(response).await),
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
            actions::action_request_attention,
            actions::action_send_notification,
            actions::action_open_url,
            actions::action_show_notify,
            actions::action_media_play_pause,
            actions::action_play_netease,
            actions::presence_nag,
            actions::presence_nag_close_all,
            client_config::load_public_client_config,
            client_config::get_token_status,
            client_config::test_backend_auth,
            client_config::save_client_config,
            ui_prefs::load_ui_prefs,
            ui_prefs::save_ui_prefs,
            ws_bridge::native_ws_connect,
            ws_bridge::native_ws_send,
            ws_bridge::native_ws_disconnect,
            greet,
            list_dream_fonts,
            list_themes,
            list_room_assets,
            list_room_props,
            list_live2d_models,
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
            transcribe_audio,
            start_voice_hotkey_listener,
            save_avatar,
            load_avatar,
            read_avatars_json,
            write_avatars_json,
            write_text_file,
            dream_get_state,
            hardware_get_devices,
            hardware_connect,
            dream_get_stats,
            dream_enter,
            dream_chat,
            dream_exit,
            dream_wake,
            dream_resume,
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
            activity_reading_chat,
            activity_reading_library,
            activity_reading_add_book,
            activity_reading_start_from_library,
            activity_reading_delete_book,
            activity_reading_rename_book,
            activity_reading_categorize_book,
            activity_gomoku_start,
            activity_gomoku_state,
            activity_gomoku_move,
            activity_gomoku_close,
            activity_gomoku_chat,
            activity_gomoku_ai_move,
            activity_chess_start,
            activity_chess_state,
            activity_chess_move,
            activity_chess_legal_moves,
            activity_chess_close,
            activity_chess_chat,
            activity_chess_ai_move,
            activity_dream_seed_start,
            activity_dream_seed_state,
            activity_dream_seed_chat,
            activity_dream_seed_close,
            group_list,
            group_create,
            group_get,
            group_send,
            group_history,
            group_settings_get,
            group_settings_patch,
            group_delete,
            group_patch_roster,
            get_meta_mode,
            patch_meta_mode,
            patch_presence_nag,
            patch_proactive_gap,
            get_proactive_gap_hours,
            get_chat_settings,
            set_chat_mode,
            set_chat_style,
            set_chat_multi_message,
            get_tool_loop_settings,
            update_tool_loop_settings,
            get_thinking_settings,
            update_thinking_settings,
            get_lorebook_entries,
            add_lorebook_entry,
            update_lorebook_entry,
            delete_lorebook_entry,
            get_jailbreak_entries,
            add_jailbreak_entry,
            update_jailbreak_entry,
            delete_jailbreak_entry,
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
            ("POST", "/dream/wake"),
            ("POST", "/dream/resume"),
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
    fn invalid_token_reports_401_without_leaking_token() {
        let message = safe_http_error_message(reqwest::StatusCode::UNAUTHORIZED, None);
        assert_eq!(message, "HTTP 401: 认证失败，请检查本地 token 配置");
        assert!(!message.contains("Bearer"));
        assert!(!message.contains("secret-value"));
    }

    #[test]
    fn scope_denied_reports_403_with_detail_but_no_token() {
        let message = safe_http_error_message(
            reqwest::StatusCode::FORBIDDEN,
            Some("need: hardware"),
        );
        assert!(message.contains("scope"));
        assert!(message.contains("desktop"));
        assert!(message.contains("need: hardware"));
        assert!(!message.contains("Bearer"));
        assert!(!message.contains("secret-value"));
    }

    #[test]
    fn rate_limited_reports_429_without_leaking_token() {
        let message = safe_http_error_message(reqwest::StatusCode::TOO_MANY_REQUESTS, None);
        assert!(message.contains("429"));
        assert!(message.contains("认证失败次数过多"));
        assert!(!message.contains("Bearer"));
        assert!(!message.contains("secret-value"));
    }

    #[test]
    fn http_client_has_timeout() {
        // Verifies that http_client() builds successfully (timeout is set internally).
        assert!(http_client().is_ok());
        assert!(llm_http_client().is_ok());
    }
}

#[cfg(test)]
mod dream_font_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn lists_supported_dream_fonts_with_compatible_shape() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let font_dir = std::env::temp_dir().join(format!(
            "emerald-dream-font-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(font_dir.join("nested")).unwrap();
        fs::write(font_dir.join("Alpha.ttf"), []).unwrap();
        fs::write(font_dir.join("Beta.WOFF2"), []).unwrap();
        fs::write(font_dir.join("ignored.txt"), []).unwrap();

        let value = list_dream_fonts_in_dir(&font_dir).unwrap();
        fs::remove_dir_all(&font_dir).unwrap();

        assert_eq!(
            value,
            serde_json::json!([
                {
                    "fileName": "Alpha.ttf",
                    "label": "Alpha",
                    "url": "/fonts/Alpha.ttf",
                },
                {
                    "fileName": "Beta.WOFF2",
                    "label": "Beta",
                    "url": "/fonts/Beta.WOFF2",
                },
            ])
        );
    }
}

#[cfg(test)]
mod avatar_file_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn cleanup_removes_only_old_generated_files_for_same_role() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "emerald-avatar-cleanup-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();

        let keep = dir.join("her_200.png");
        let old_same_role = dir.join("her_100.png");
        let other_role = dir.join("you_100.png");
        let default_avatar = dir.join("her_default.png");
        let unrelated = dir.join("notes.txt");
        for path in [&keep, &old_same_role, &other_role, &default_avatar, &unrelated] {
            fs::write(path, []).unwrap();
        }

        cleanup_old_generated_avatars(&dir, "her", &keep).unwrap();

        assert!(keep.exists());
        assert!(!old_same_role.exists());
        assert!(other_role.exists());
        assert!(default_avatar.exists());
        assert!(unrelated.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn generated_avatar_name_requires_exact_role_and_numeric_timestamp() {
        assert!(is_generated_avatar_for_role("dream_background_day_123.png", "dream_background_day"));
        assert!(!is_generated_avatar_for_role("dream_background_night_123.png", "dream_background_day"));
        assert!(!is_generated_avatar_for_role("her_default.png", "her"));
        assert!(!is_generated_avatar_for_role("her_123.jpg", "her"));
    }
}

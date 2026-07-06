use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, UserAttentionType, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn action_minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn action_request_attention(window: WebviewWindow) -> Result<(), String> {
    window
        .request_user_attention(Some(UserAttentionType::Informational))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn action_send_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn action_open_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("url 不能为空".to_string());
    }
    if !is_supported_url(url) {
        return Err(format!("不支持的 URL scheme: {url}"));
    }

    app.opener()
        .open_url(url.to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn action_show_notify(
    app: AppHandle,
    title: Option<String>,
    text: String,
) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("text 不能为空".to_string());
    }

    let title = title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Emerald");

    eprintln!("[actions] show_notify: {title}: {text}");
    app.dialog()
        .message(text.to_string())
        .title(title.to_string())
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});

    Ok(())
}

#[tauri::command]
pub async fn action_media_play_pause() -> Result<(), String> {
    media_play_pause()
}

#[tauri::command]
pub async fn action_play_netease(app: AppHandle, song_id: String) -> Result<(), String> {
    let song_id = song_id.trim();
    if song_id.is_empty() {
        return Err("song_id 不能为空".to_string());
    }
    // Try native NetEase scheme first; fall back to HTTPS URL if the desktop client is not installed.
    let native_url = format!("orpheus://song?id={}", song_id);
    let web_url = format!("https://music.163.com/song?id={}", song_id);

    if app.opener().open_url(native_url, None::<&str>).is_err() {
        app.opener()
            .open_url(web_url, None::<&str>)
            .map_err(|e| e.to_string())?;
    }
    eprintln!("[actions] play_netease: song_id={}", song_id);
    Ok(())
}

#[derive(Clone, Serialize)]
struct PresenceNagPayload {
    text: String,
    avatar: String,
}

#[tauri::command]
pub async fn presence_nag(app: AppHandle, text: String, avatar: Option<String>) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("text 不能为空".to_string());
    }
    let avatar = avatar
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("character");
    let window = app
        .get_webview_window("presence-nag")
        .ok_or_else(|| "presence-nag window 不存在".to_string())?;

    window
        .emit(
            "presence-nag",
            PresenceNagPayload {
                text: text.to_string(),
                avatar: avatar.to_string(),
            },
        )
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn presence_nag_close_all(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("presence-nag")
        .ok_or_else(|| "presence-nag window 不存在".to_string())?;
    window.hide().map_err(|e| e.to_string())
}

fn is_supported_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
}

#[cfg(target_os = "windows")]
fn media_play_pause() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MEDIA_PLAY_PAUSE,
    };

    unsafe {
        keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }

    eprintln!("[actions] media_play_pause: sent Windows media key");
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn media_play_pause() -> Result<(), String> {
    Err("media_key_not_supported_on_this_platform".into())
}

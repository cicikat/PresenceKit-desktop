use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn action_minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
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

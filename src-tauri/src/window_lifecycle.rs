use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const PET_WINDOW_LABEL: &str = "pet";
pub const PRESENCE_NAG_WINDOW_LABEL: &str = "presence-nag";

#[derive(Default)]
pub struct WindowLifecycleState {
    pub pet_creation: Mutex<()>,
    pub presence_nag_creation: Mutex<()>,
}

fn pet_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(
        app,
        PET_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=pet".into()),
    )
    .title("Emerald Pet")
    .inner_size(340.0, 400.0)
    .resizable(false)
    .transparent(true)
    .visible(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .build()
}

fn presence_nag_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(PRESENCE_NAG_WINDOW_LABEL) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(
        app,
        PRESENCE_NAG_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=presence-nag".into()),
    )
    .title("Emerald Presence Notice")
    .inner_size(460.0, 270.0)
    .resizable(false)
    .transparent(true)
    .visible(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .center()
    .build()
}

#[tauri::command]
pub fn ensure_pet_window(
    app: AppHandle,
    state: State<'_, WindowLifecycleState>,
) -> Result<(), String> {
    let _guard = state
        .pet_creation
        .lock()
        .map_err(|_| "pet window creation lock poisoned".to_string())?;
    pet_window(&app)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn destroy_pet_window(
    app: AppHandle,
    state: State<'_, WindowLifecycleState>,
) -> Result<(), String> {
    let _guard = state
        .pet_creation
        .lock()
        .map_err(|_| "pet window creation lock poisoned".to_string())?;
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        window.destroy().map_err(|error| error.to_string())?;
        eprintln!("[window-lifecycle] destroyed pet window");
    }
    Ok(())
}

pub fn ensure_presence_nag_window(
    app: &AppHandle,
    state: &WindowLifecycleState,
) -> Result<WebviewWindow, String> {
    let _guard = state
        .presence_nag_creation
        .lock()
        .map_err(|_| "presence-nag window creation lock poisoned".to_string())?;
    presence_nag_window(app).map_err(|error| error.to_string())
}

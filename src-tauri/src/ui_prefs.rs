use std::path::PathBuf;
use tauri::Manager;

fn ui_prefs_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))?;
    Ok(dir.join("ui-preferences.json"))
}

#[tauri::command]
pub fn load_ui_prefs(app: tauri::AppHandle) -> String {
    let path = match ui_prefs_path(&app) {
        Ok(p) => p,
        Err(_) => return "{}".to_string(),
    };
    std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn save_ui_prefs(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = ui_prefs_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录: {e}"))?;
    }

    let mut tmp_os = path.clone().into_os_string();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);
    std::fs::write(&tmp_path, &contents).map_err(|e| format!("写入失败: {e}"))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

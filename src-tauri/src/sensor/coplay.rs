//! Leased desktop-only game observations; never uploads process lists or save contents.
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::{json, Value};

use super::visual::{has_unlocked_desktop, VisualRunnerConfig};

pub(super) struct Collector {
    client_id: String,
    last_poll: Instant,
    save_fingerprints: HashMap<String, u64>,
}

impl Collector {
    pub(super) fn new() -> Option<Self> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).ok()?;
        Some(Self {
            client_id: bytes.iter().map(|b| format!("{b:02x}")).collect(),
            last_poll: Instant::now() - Duration::from_secs(10),
            save_fingerprints: HashMap::new(),
        })
    }

    pub(super) async fn tick(&mut self, cfg: &VisualRunnerConfig, client: &reqwest::Client, stop: &AtomicBool) {
        if self.last_poll.elapsed() < Duration::from_secs(10) { return; }
        self.last_poll = Instant::now();
        let connection = crate::client_config::load_client_config(&cfg.app);
        let consent = cfg.runtime.config();
        let revision = cfg.runtime.revision();
        let metadata = connection.sensor_config.enabled && has_unlocked_desktop();
        let frame_available = metadata && consent.on_demand_enabled;
        let base = connection.backend_base.trim_end_matches('/');
        let Ok(response) = client.post(format!("{base}/coplay/device/poll"))
            .bearer_auth(&connection.admin_token)
            .json(&json!({"client_id": self.client_id, "metadata_available": metadata,
                          "frame_available": frame_available})).send().await else { return; };
        if !response.status().is_success() { return; }
        let Ok(lease) = response.json::<Value>().await else { return; };
        if lease["enabled"] != true || lease["protocol_version"] != 1 { return; }
        if stop.load(Ordering::SeqCst) || !metadata || !has_unlocked_desktop()
            || !crate::client_config::load_client_config(&cfg.app).sensor_config.enabled
            || revision != cfg.runtime.revision() { return; }
        let started = Instant::now();
        let ttl = lease["ttl_seconds"].as_f64().unwrap_or(0.0).min(20.0);
        let mut status = "ok";
        let mut game_id = String::new();
        let mut game_name = String::new();
        let mut foreground = false;
        let mut image = String::new();
        let mut save_changed = false;
        match detect_game(&lease) {
            Ok(Some(game)) => {
                game_id = game.id;
                game_name = game.name;
                foreground = matches_foreground(&game.process, game.install_dir.as_deref());
                if foreground && lease["frame_allowed"] == true && frame_available
                    && has_unlocked_desktop() && cfg.runtime.config().on_demand_enabled
                    && revision == cfg.runtime.revision() {
                    let window = foreground_window();
                    if let Ok(frame) = super::visual::capture_game_window() {
                        if let Ok(bytes) = super::visual::encode_jpeg(frame) {
                            if bytes.len() <= 1024 * 1024 && window == foreground_window()
                                && matches_foreground(&game.process, game.install_dir.as_deref()) {
                                image = base64::engine::general_purpose::STANDARD.encode(bytes);
                            }
                        }
                    }
                }
                if let Some(save_dir) = game.save_dir {
                    if let Some(fingerprint) = save_fingerprint(&save_dir) {
                        let key = format!("{}:{}:{game_id}", lease["char_id"], lease["revision"]);
                        if self.save_fingerprints.len() >= 100 { self.save_fingerprints.clear(); }
                        save_changed = self.save_fingerprints.insert(key, fingerprint)
                            .is_some_and(|previous| previous != fingerprint);
                    }
                }
            }
            Ok(None) => {}
            Err(_) => status = "failed",
        }
        let now = crate::client_config::load_client_config(&cfg.app);
        if stop.load(Ordering::SeqCst) || started.elapsed().as_secs_f64() >= ttl
            || now.backend_base != connection.backend_base || now.admin_token != connection.admin_token
            || !now.sensor_config.enabled || !has_unlocked_desktop()
            || revision != cfg.runtime.revision() { return; }
        if !cfg.runtime.config().on_demand_enabled { image.clear(); }
        let _ = client.post(format!("{base}/coplay/device/result"))
            .bearer_auth(&connection.admin_token)
            .json(&json!({"client_id": self.client_id, "lease_id": lease["lease_id"],
                "char_id": lease["char_id"], "revision": lease["revision"],
                "captured_at": lease["server_time"].as_f64().unwrap_or(0.0) + started.elapsed().as_secs_f64(),
                "status": status, "game_id": game_id, "game_name": game_name,
                "foreground": foreground, "save_changed": save_changed, "image_base64": image}))
            .send().await;
    }
}

struct Game {
    id: String,
    name: String,
    process: String,
    install_dir: Option<String>,
    save_dir: Option<String>,
}

fn process_key(value: &str) -> String {
    let key = value.trim().to_lowercase();
    key.strip_suffix(".exe").unwrap_or(&key).to_string()
}

#[cfg(target_os = "windows")]
fn detect_game(lease: &Value) -> Result<Option<Game>, String> {
    use std::os::windows::process::CommandExt;
    let processes = running_processes()?;
    let games = lease["games"].as_array().ok_or("missing game policy")?;
    let output = std::process::Command::new("reg.exe").args([
        "query", "HKCU\\Software\\Valve\\Steam", "/v", "RunningAppID",
    ]).creation_flags(0x08000000).output();
    let appid = output.ok().filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().find(|l| l.contains("RunningAppID"))
            .and_then(|l| l.split_whitespace().last()).map(str::to_string))
        .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok()).filter(|id| *id > 0);
    if let Some(id) = appid {
        let mut name = format!("App {id}");
        let mut install_dir = None;
        if let Some(roots) = lease["steam_library_paths"].as_array() {
            for root in roots.iter().take(20).filter_map(Value::as_str) {
                let root = std::path::Path::new(root);
                let steamapps = if root.join("steamapps").is_dir() { root.join("steamapps") } else { root.to_path_buf() };
                let manifest = steamapps.join(format!("appmanifest_{id}.acf"));
                if manifest.metadata().is_ok_and(|m| m.len() <= 1024 * 1024) {
                    if let Ok(text) = std::fs::read_to_string(&manifest) {
                        if let Some(value) = acf_value(&text, "name") { name = value; }
                        if let Some(value) = acf_value(&text, "installdir") {
                            if let Ok(path) = steamapps.join("common").join(value).canonicalize() {
                                install_dir = Some(path.to_string_lossy().to_string());
                            }
                        }
                        break;
                    }
                }
            }
        }
        return Ok(Some(Game { id: format!("steam:{id}"), name: name.chars().take(200).collect(),
                              process: String::new(), install_dir, save_dir: None }));
    }
    for game in games.iter().take(100) {
        let process = process_key(game["process_name"].as_str().unwrap_or(""));
        if !process.is_empty() && processes.contains(&process) {
            return Ok(Some(Game { id: game["game_id"].as_str().unwrap_or("").into(),
                name: game["name"].as_str().unwrap_or("").chars().take(200).collect(), process,
                install_dir: None, save_dir: game["save_dir"].as_str().filter(|s| !s.is_empty()).map(str::to_owned) }));
        }
    }
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
fn detect_game(_: &Value) -> Result<Option<Game>, String> { Err("unsupported".into()) }

#[cfg(target_os = "windows")]
fn running_processes() -> Result<Vec<String>, String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    unsafe {
        let handle = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|e| e.to_string())?;
        let mut row = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut output = Vec::new();
        if Process32FirstW(handle, &mut row).is_err() { let _ = CloseHandle(handle); return Err("process snapshot failed".into()); }
        loop {
            let len = row.szExeFile.iter().position(|c| *c == 0).unwrap_or(row.szExeFile.len());
            output.push(process_key(&String::from_utf16_lossy(&row.szExeFile[..len])));
            if Process32NextW(handle, &mut row).is_err() { break; }
        }
        let _ = CloseHandle(handle);
        Ok(output)
    }
}

#[cfg(target_os = "windows")]
fn foreground_window() -> usize {
    unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow().0 as usize }
}
#[cfg(not(target_os = "windows"))]
fn foreground_window() -> usize { 0 }

#[cfg(target_os = "windows")]
fn foreground_path() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid));
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut data = vec![0u16; 32768]; let mut size = data.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(data.as_mut_ptr()), &mut size).is_ok();
        let _ = CloseHandle(handle);
        ok.then(|| String::from_utf16_lossy(&data[..size as usize]))
    }
}
#[cfg(not(target_os = "windows"))]
fn foreground_path() -> Option<String> { None }

fn matches_foreground(process: &str, install_dir: Option<&str>) -> bool {
    let Some(path) = foreground_path() else { return false; };
    if !process.is_empty() {
        return std::path::Path::new(&path).file_name().and_then(|p| p.to_str()).is_some_and(|p| process_key(p) == process_key(process));
    }
    install_dir.is_some_and(|root| path.to_lowercase().starts_with(&(root.trim_start_matches("\\\\?\\").trim_end_matches('\\').to_lowercase() + "\\")))
}

fn acf_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let parts: Vec<_> = line.split('"').collect();
        (parts.len() >= 4 && parts[1] == key).then(|| parts[3].to_string())
    })
}

fn save_fingerprint(directory: &str) -> Option<u64> {
    use std::hash::{Hash, Hasher};
    let mut entries = std::fs::read_dir(directory).ok()?.take(2001).collect::<Result<Vec<_>, _>>().ok()?;
    if entries.len() > 2000 { return None; }
    entries.sort_by_key(|e| e.file_name());
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    for entry in entries {
        let metadata = entry.metadata().ok()?;
        entry.file_name().hash(&mut hash); metadata.len().hash(&mut hash); metadata.modified().ok()?.hash(&mut hash);
    }
    Some(hash.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_keys_do_not_depend_on_case_or_exe_suffix() {
        assert_eq!(process_key(" Fixture.EXE "), "fixture");
        assert_eq!(acf_value("\"name\"  \"Fixture Game\"", "name").as_deref(), Some("Fixture Game"));
    }
    #[test]
    fn each_runner_has_an_independent_connection_identity() {
        let a = Collector::new().unwrap(); let b = Collector::new().unwrap();
        assert_eq!(a.client_id.len(), 32); assert_ne!(a.client_id, b.client_id);
    }
}

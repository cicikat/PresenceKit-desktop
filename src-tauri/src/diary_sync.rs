use crate::client_config::{
    backend_url, load_client_config, read_json, target_config_path, ClientConfig,
    DiaryManifestEntry, DiarySyncConfig,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ENTRY_BYTES: u64 = 256 * 1024;
const MAX_BATCH_ENTRIES: usize = 100;
const MAX_BATCH_BYTES: usize = 2 * 1024 * 1024;
const MAX_SCAN_ENTRIES: usize = 2000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiarySyncStatus {
    pub configured: bool,
    pub tracked_entries: usize,
    pub last_sync_at: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiarySyncSummary {
    pub status: String,
    pub scanned_entries: usize,
    pub uploaded_entries: usize,
    pub tombstones: usize,
    pub stale_entries: usize,
    pub conflicts: usize,
    pub tracked_entries: usize,
}

#[derive(Debug, Clone, Serialize)]
struct DiarySyncEntry {
    logical_date: String,
    content: String,
    sha256: String,
    mtime: i64,
    revision: i64,
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct DiarySyncResult {
    logical_date: String,
    status: String,
}

#[derive(Debug, Deserialize)]
struct DiaryBatchResponse {
    entries: Vec<DiarySyncResult>,
}

#[derive(Debug, Clone)]
struct ScannedEntry {
    logical_date: String,
    content: Option<String>,
    sha256: String,
    mtime: i64,
    revision: i64,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

#[cfg(test)]
fn sha256(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|_| "diary file could not be opened for hashing".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "diary file could not be hashed".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn valid_date_filename(name: &str) -> Option<String> {
    if name.len() != 13 || !name.ends_with(".md") {
        return None;
    }
    let bytes = name.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    for index in [0, 1, 2, 3, 5, 6, 8, 9] {
        if !bytes[index].is_ascii_digit() {
            return None;
        }
    }
    let year = name[0..4].parse::<u32>().ok()?;
    let month = name[5..7].parse::<u32>().ok()?;
    let day = name[8..10].parse::<u32>().ok()?;
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => 0,
    };
    if year == 0 || month == 0 || day == 0 || day > max_day {
        return None;
    }
    Some(name[0..10].to_string())
}

fn modified_millis(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn scan_directory(
    root: &Path,
    manifest: &BTreeMap<String, DiaryManifestEntry>,
) -> Result<BTreeMap<String, ScannedEntry>, String> {
    let mut result = BTreeMap::new();
    scan_directory_inner(root, manifest, &mut result)?;
    Ok(result)
}

fn scan_directory_inner(
    root: &Path,
    manifest: &BTreeMap<String, DiaryManifestEntry>,
    result: &mut BTreeMap<String, ScannedEntry>,
) -> Result<(), String> {
    let mut children = fs::read_dir(root)
        .map_err(|_| "diary directory could not be read".to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.file_name());

    for entry in children {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|_| "diary entry metadata could not be read".to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            scan_directory_inner(&path, manifest, result)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(logical_date) = valid_date_filename(&file_name) else {
            continue;
        };
        if result.len() >= MAX_SCAN_ENTRIES {
            return Err("diary scan entry limit exceeded".to_string());
        }
        if result.contains_key(&logical_date) {
            return Err("multiple diary files share one logical date".to_string());
        }
        let metadata =
            fs::metadata(&path).map_err(|_| "diary file metadata could not be read".to_string())?;
        if metadata.len() > MAX_ENTRY_BYTES {
            return Err("diary file exceeds the 256 KiB limit".to_string());
        }
        let sha256 = sha256_file(&path)?;
        let content = if manifest
            .get(&logical_date)
            .map(|previous| !previous.deleted && previous.sha256 == sha256)
            .unwrap_or(false)
        {
            None
        } else {
            Some(
                fs::read_to_string(&path)
                    .map_err(|_| "diary file could not be decoded as UTF-8".to_string())?,
            )
        };
        let mtime = modified_millis(&metadata);
        result.insert(
            logical_date.clone(),
            ScannedEntry {
                logical_date,
                sha256,
                content,
                mtime,
                revision: mtime,
            },
        );
    }
    Ok(())
}

fn pending_entries(
    cfg: &ClientConfig,
    current: &BTreeMap<String, ScannedEntry>,
) -> Vec<DiarySyncEntry> {
    let mut pending = BTreeMap::new();
    for (logical_date, current_entry) in current {
        let unchanged = cfg
            .diary_sync
            .manifest
            .get(logical_date)
            .map(|previous| !previous.deleted && previous.sha256 == current_entry.sha256)
            .unwrap_or(false);
        if unchanged {
            continue;
        }
        let Some(content) = current_entry.content.as_ref() else {
            continue;
        };
        pending.insert(
            logical_date.clone(),
            DiarySyncEntry {
                logical_date: current_entry.logical_date.clone(),
                content: content.clone(),
                sha256: current_entry.sha256.clone(),
                mtime: current_entry.mtime,
                revision: current_entry.revision,
                deleted: false,
            },
        );
    }
    let deletion_revision = now_millis();
    for (logical_date, previous) in &cfg.diary_sync.manifest {
        if previous.deleted || current.contains_key(logical_date) {
            continue;
        }
        pending.insert(
            logical_date.clone(),
            DiarySyncEntry {
                logical_date: logical_date.clone(),
                content: String::new(),
                sha256: previous.sha256.clone(),
                mtime: deletion_revision,
                revision: deletion_revision,
                deleted: true,
            },
        );
    }
    pending.into_values().collect()
}

fn batch_entries(entries: Vec<DiarySyncEntry>) -> Vec<Vec<DiarySyncEntry>> {
    let mut batches = Vec::new();
    let mut current = Vec::new();
    let mut current_bytes = 0usize;
    for entry in entries {
        let entry_bytes = serde_json::to_vec(&entry)
            .map(|value| value.len())
            .unwrap_or(MAX_BATCH_BYTES);
        if !current.is_empty()
            && (current.len() >= MAX_BATCH_ENTRIES || current_bytes + entry_bytes > MAX_BATCH_BYTES)
        {
            batches.push(current);
            current = Vec::new();
            current_bytes = 0;
        }
        current_bytes += entry_bytes;
        current.push(entry);
    }
    if !current.is_empty() {
        batches.push(current);
    }
    batches
}

fn persist_diary_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    diary_sync: &DiarySyncConfig,
) -> Result<(), String> {
    let path = target_config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "could not create local config directory".to_string())?;
    }
    let existing = read_json(&path)
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let mut object = existing.as_object().cloned().unwrap_or_default();
    object.insert(
        "diarySync".to_string(),
        serde_json::to_value(diary_sync)
            .map_err(|_| "could not encode diary settings".to_string())?,
    );
    let serialized = serde_json::to_string_pretty(&serde_json::Value::Object(object))
        .map_err(|_| "could not encode local config".to_string())?;
    let mut tmp_os = path.clone().into_os_string();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);
    fs::write(&tmp_path, serialized).map_err(|_| "could not write local config".to_string())?;
    fs::rename(&tmp_path, &path).map_err(|_| "could not replace local config".to_string())?;
    Ok(())
}

fn configured_directory(cfg: &ClientConfig) -> Result<PathBuf, String> {
    let path = cfg
        .diary_sync
        .obsidian_path
        .as_deref()
        .ok_or_else(|| "diary directory is not configured".to_string())?;
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.is_dir() {
        return Err("configured diary directory is unavailable".to_string());
    }
    Ok(path)
}

fn apply_successes(
    manifest: &mut BTreeMap<String, DiaryManifestEntry>,
    sent: &[DiarySyncEntry],
    response: DiaryBatchResponse,
) -> Result<(usize, usize, usize, usize), String> {
    if response.entries.len() != sent.len() {
        return Err("diary sync response was incomplete".to_string());
    }
    let mut uploaded = 0;
    let mut tombstones = 0;
    let mut stale = 0;
    let mut conflicts = 0;
    for result in response.entries {
        let Some(entry) = sent
            .iter()
            .find(|entry| entry.logical_date == result.logical_date)
        else {
            return Err("diary sync response contained an unknown date".to_string());
        };
        match result.status.as_str() {
            "applied" | "idempotent" => {
                manifest.insert(
                    entry.logical_date.clone(),
                    DiaryManifestEntry {
                        sha256: entry.sha256.clone(),
                        revision: entry.revision,
                        mtime: entry.mtime,
                        deleted: entry.deleted,
                    },
                );
                uploaded += 1;
                if entry.deleted {
                    tombstones += 1;
                }
            }
            "stale_revision" => stale += 1,
            "conflict" => conflicts += 1,
            _ => return Err("diary sync returned an unknown entry status".to_string()),
        }
    }
    Ok((uploaded, tombstones, stale, conflicts))
}

async fn post_batch(
    cfg: &ClientConfig,
    generation: &str,
    batch: &[DiarySyncEntry],
) -> Result<DiaryBatchResponse, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| "could not create backend connection".to_string())?;
    let response = client
        .post(backend_url(cfg, "/integrations/diary/sync"))
        .bearer_auth(&cfg.admin_token)
        .json(&serde_json::json!({ "generation": generation, "entries": batch }))
        .send()
        .await
        .map_err(|_| "diary sync connection failed".to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    response
        .json::<DiaryBatchResponse>()
        .await
        .map_err(|_| "diary sync response was invalid".to_string())
}

#[tauri::command]
pub fn get_diary_sync_status(app: tauri::AppHandle) -> DiarySyncStatus {
    let cfg = load_client_config(&app);
    DiarySyncStatus {
        configured: cfg.diary_sync.obsidian_path.is_some(),
        tracked_entries: cfg
            .diary_sync
            .manifest
            .values()
            .filter(|entry| !entry.deleted)
            .count(),
        last_sync_at: cfg.diary_sync.last_sync_at,
    }
}

#[tauri::command]
pub fn set_diary_directory(app: tauri::AppHandle, path: String) -> Result<DiarySyncStatus, String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.is_absolute() || !candidate.is_dir() {
        return Err("selected diary directory is unavailable".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "selected diary directory is unavailable".to_string())?;
    let mut cfg = load_client_config(&app).diary_sync;
    let next_path = canonical.to_string_lossy().to_string();
    if cfg.obsidian_path.as_deref() != Some(next_path.as_str()) {
        cfg.manifest.clear();
        cfg.last_sync_at = None;
    }
    cfg.obsidian_path = Some(next_path);
    persist_diary_config(&app, &cfg)?;
    Ok(get_diary_sync_status(app))
}

#[tauri::command]
pub fn clear_diary_directory(app: tauri::AppHandle) -> Result<DiarySyncStatus, String> {
    persist_diary_config(&app, &DiarySyncConfig::default())?;
    Ok(get_diary_sync_status(app))
}

#[tauri::command]
pub async fn sync_diary(app: tauri::AppHandle) -> Result<DiarySyncSummary, String> {
    let cfg = load_client_config(&app);
    let root = configured_directory(&cfg)?;
    let current = scan_directory(&root, &cfg.diary_sync.manifest)?;
    let pending = pending_entries(&cfg, &current);
    let mut next_manifest = cfg.diary_sync.manifest.clone();
    if pending.is_empty() {
        return Ok(DiarySyncSummary {
            status: "no_changes".to_string(),
            scanned_entries: current.len(),
            uploaded_entries: 0,
            tombstones: 0,
            stale_entries: 0,
            conflicts: 0,
            tracked_entries: next_manifest
                .values()
                .filter(|entry| !entry.deleted)
                .count(),
        });
    }

    let generation = format!("sync-{}", now_millis());
    let mut uploaded = 0;
    let mut tombstones = 0;
    let mut stale = 0;
    let mut conflicts = 0;
    for batch in batch_entries(pending) {
        let response = post_batch(&cfg, &generation, &batch).await?;
        let (batch_uploaded, batch_tombstones, batch_stale, batch_conflicts) =
            apply_successes(&mut next_manifest, &batch, response)?;
        uploaded += batch_uploaded;
        tombstones += batch_tombstones;
        stale += batch_stale;
        conflicts += batch_conflicts;
    }

    let mut diary_sync = cfg.diary_sync.clone();
    diary_sync.manifest = next_manifest;
    diary_sync.last_sync_at = Some((now_millis() as f64) / 1000.0);
    persist_diary_config(&app, &diary_sync)?;
    Ok(DiarySyncSummary {
        status: if conflicts > 0 {
            "conflict"
        } else if stale > 0 {
            "stale"
        } else {
            "synced"
        }
        .to_string(),
        scanned_entries: current.len(),
        uploaded_entries: uploaded,
        tombstones,
        stale_entries: stale,
        conflicts,
        tracked_entries: diary_sync
            .manifest
            .values()
            .filter(|entry| !entry.deleted)
            .count(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client_config::ClientConfig;

    #[test]
    fn accepts_only_real_dated_markdown_names() {
        assert_eq!(
            valid_date_filename("2026-08-10.md"),
            Some("2026-08-10".to_string())
        );
        assert!(valid_date_filename("nested.md").is_none());
        assert!(valid_date_filename("2026-02-30.md").is_none());
        assert!(valid_date_filename("2026-08-10.txt").is_none());
    }

    #[test]
    fn pending_manifest_emits_content_changes_and_tombstones() {
        let mut cfg = ClientConfig::default();
        cfg.diary_sync.manifest.insert(
            "2026-08-09".to_string(),
            DiaryManifestEntry {
                sha256: "old-hash".to_string(),
                revision: 1,
                mtime: 1,
                deleted: false,
            },
        );
        let mut current = BTreeMap::new();
        current.insert(
            "2026-08-10".to_string(),
            ScannedEntry {
                logical_date: "2026-08-10".to_string(),
                content: Some("today".to_string()),
                sha256: sha256("today"),
                mtime: 2,
                revision: 2,
            },
        );
        let pending = pending_entries(&cfg, &current);
        assert_eq!(pending.len(), 2);
        assert!(pending
            .iter()
            .any(|entry| entry.logical_date == "2026-08-09" && entry.deleted));
        assert!(pending
            .iter()
            .any(|entry| entry.logical_date == "2026-08-10" && !entry.deleted));
    }

    #[test]
    fn batches_respect_entry_count_bound() {
        let entries = (0..101)
            .map(|index| DiarySyncEntry {
                logical_date: format!("2026-01-{:02}", (index % 28) + 1),
                content: "x".to_string(),
                sha256: sha256("x"),
                mtime: index,
                revision: index,
                deleted: false,
            })
            .collect();
        let batches = batch_entries(entries);
        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].len(), MAX_BATCH_ENTRIES);
        assert_eq!(batches[1].len(), 1);
    }
}

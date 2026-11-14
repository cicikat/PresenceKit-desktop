mod files;
#[cfg(test)]
mod tests;

use files::{durable_json, FileError, Identity, Version};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const PROTOCOL: &str = "device-file-agent.v1";
const WIRE_LIMIT: usize = 65536;
const JOURNAL_LIMIT: usize = 128;

#[derive(Clone, Serialize, Deserialize)]
struct Grant {
    id: String,
    revision: String,
    root: PathBuf,
    file: Option<String>,
    identity: Identity,
    write: bool,
    alias: String,
    binding: String,
    #[serde(default)]
    unrestricted: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    device_id: String,
    state: Mode,
    grants: Vec<Grant>,
    #[serde(default)]
    unrestricted: Option<Grant>,
}

#[derive(Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Enabled,
    Paused,
    #[default]
    Disabled,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Reference {
    server_epoch: String,
    device_id: String,
    device_epoch: String,
    task_id: String,
    workspace_id: String,
    revision: String,
    nonce: String,
    lease: String,
    seq: u32,
}

impl Reference {
    fn valid(&self) -> bool {
        let hex = |s: &str, len| {
            s.len() == len
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        [
            &self.server_epoch,
            &self.device_id,
            &self.device_epoch,
            &self.task_id,
            &self.workspace_id,
            &self.revision,
            &self.nonce,
        ]
        .iter()
        .all(|id| hex(id, 32))
            && hex(&self.lease, 64)
            && (1..=30).contains(&self.seq)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Action {
    op: String,
    path: String,
    query: String,
    start: usize,
    expected_sha256: Option<String>,
    before: String,
    after: String,
    version_id: Option<String>,
}

impl Action {
    fn valid(&self) -> bool {
        self.path.len() <= 512
            && self.query.len() <= 1024
            && self.before.len() <= 8192
            && self.after.len() <= 8192
            && (1..=262144).contains(&self.start)
    }
}

#[derive(Deserialize)]
struct Command {
    #[serde(rename = "ref")]
    reference: Reference,
    action: Action,
    ttl_ms: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct Receipt {
    #[serde(rename = "ref")]
    reference: Reference,
    code: String,
    body: Value,
}

impl Receipt {
    fn new(reference: Reference, result: Result<Value, FileError>) -> Self {
        let (code, body) = match result {
            Ok(body) => ("ok", body),
            Err(code) => (code, json!({})),
        };
        Self {
            reference,
            code: code.to_owned(),
            body,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Record {
    binding: String,
    reference: Reference,
    version: Version,
    receipt: Option<Receipt>,
    acknowledged: bool,
}

struct Runtime {
    base: PathBuf,
    settings: Settings,
    epoch: String,
    binding: String,
    records: Vec<Record>,
    online: bool,
    seen: BTreeMap<String, u32>,
    action: Option<(String, String)>,
}

#[derive(Default)]
pub struct Executor(Mutex<Option<Runtime>>);

fn new_id() -> Result<String, FileError> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes).map_err(|_| "io_failed")?;
    Ok(bytes.iter().map(|v| format!("{v:02x}")).collect())
}

fn load<T: serde::de::DeserializeOwned>(path: PathBuf) -> Result<Option<T>, FileError> {
    match fs::read(path) {
        Ok(raw) => serde_json::from_slice(&raw)
            .map(Some)
            .map_err(|_| "io_failed"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("io_failed"),
    }
}

fn connection(app: &AppHandle) -> (crate::client_config::ClientConfig, String) {
    let config = crate::load_client_config(app);
    let binding = format!(
        "{:x}",
        Sha256::digest(format!("{}\n{}", config.backend_base, config.admin_token).as_bytes(),)
    );
    (config, binding)
}

impl Runtime {
    fn init(app: &AppHandle) -> Result<Self, FileError> {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|_| "io_failed")?
            .join("device-file-agent");
        let settings = match load(base.join("grants.json"))? {
            Some(value) => value,
            None => {
                let value = Settings {
                    device_id: new_id()?,
                    state: Mode::Disabled,
                    grants: vec![],
                    unrestricted: None,
                };
                durable_json(&base.join("grants.json"), &value)?;
                value
            }
        };
        let records = load(base.join("journal.json"))?.unwrap_or_default();
        Ok(Self {
            base,
            settings,
            epoch: new_id()?,
            binding: connection(app).1,
            records,
            online: false,
            seen: BTreeMap::new(),
            action: None,
        })
    }

    fn persist_settings(&mut self, settings: Settings) -> Result<(), FileError> {
        durable_json(&self.base.join("grants.json"), &settings)?;
        self.settings = settings;
        Ok(())
    }

    fn persist_records(&self) -> Result<(), FileError> {
        durable_json(&self.base.join("journal.json"), &self.records)
    }

    fn record_mutation(
        &mut self,
        reference: Reference,
        grant: &Grant,
        action: &Action,
        local: bool,
    ) -> Result<Value, FileError> {
        let undo = action.version_id.as_ref().and_then(|id| {
            self.records.iter().find(|r| {
                r.version.id == *id
                    && r.binding == self.binding
                    && r.receipt
                        .as_ref()
                        .is_some_and(|receipt| receipt.code == "ok")
            })
        });
        let mutation = files::prepare(
            grant,
            &reference.task_id,
            &action.path,
            &action.op,
            action.expected_sha256.as_deref().unwrap_or(""),
            &action.before,
            &action.after,
            undo.map(|r| &r.version),
        )?;
        if self.records.len() >= JOURNAL_LIMIT {
            return Err("storage_full");
        }
        self.records.push(Record {
            binding: self.binding.clone(),
            reference: reference.clone(),
            version: mutation.version.clone(),
            receipt: None,
            acknowledged: local,
        });
        if let Err(code) = self.persist_records() {
            self.records.pop();
            return Err(code);
        }
        let result = mutation
            .commit(grant)
            .map(|()| files::saved(&mutation.version));
        self.records.last_mut().ok_or("outcome_unknown")?.receipt =
            Some(Receipt::new(reference, result.clone()));
        if self.persist_records().is_err() {
            self.records.last_mut().ok_or("outcome_unknown")?.receipt = None;
            return Err("outcome_unknown");
        }
        result
    }

    fn execute(&mut self, server_epoch: &str, command: Command, requested: Instant) -> Receipt {
        let Command {
            reference,
            action,
            ttl_ms,
        } = command;
        let result = (|| {
            if !reference.valid()
                || !action.valid()
                || reference.server_epoch != server_epoch
                || reference.device_id != self.settings.device_id
                || reference.device_epoch != self.epoch
                || !(1..=30000).contains(&ttl_ms)
                || requested.elapsed() >= Duration::from_millis(ttl_ms)
            {
                return Err("expired");
            }
            let grant = self.grant(&reference).ok_or("grant_changed")?.clone();
            if self.settings.state != Mode::Enabled {
                return Err("grant_changed");
            }
            if self.seen.len() >= 512 && !self.seen.contains_key(&reference.task_id) {
                return Err("storage_full");
            }
            let last = self.seen.entry(reference.task_id.clone()).or_default();
            if reference.seq <= *last {
                return Err("expired");
            }
            *last = reference.seq;
            self.action = Some((action.op.clone(), action.path.clone()));
            match action.op.as_str() {
                "find" => files::find(&grant, &action.query),
                "read" => files::inspect(&grant, &action.path, action.start),
                "verify" => files::verify(
                    &grant,
                    &action.path,
                    action.expected_sha256.as_deref().unwrap_or(""),
                ),
                "patch" | "create" | "undo" => {
                    self.record_mutation(reference.clone(), &grant, &action, false)
                }
                _ => Err("invalid_action"),
            }
        })();
        self.action = None;
        Receipt::new(reference, result)
    }

    fn grant(&self, reference: &Reference) -> Option<&Grant> {
        self.settings.grants.iter().chain(self.settings.unrestricted.iter()).find(|g| {
            g.binding == self.binding
                && g.id == reference.workspace_id
                && g.revision == reference.revision
        })
    }

    fn pending(&mut self) -> Option<Receipt> {
        for index in 0..self.records.len() {
            let row = &self.records[index];
            if row.binding != self.binding || row.acknowledged {
                continue;
            }
            if let Some(receipt) = &row.receipt {
                if receipt.code != "outcome_unknown" {
                    return Some(receipt.clone());
                }
            }
            let Some(grant) = self.grant(&row.reference) else {
                continue;
            };
            let Ok(saved) = files::reconcile(grant, &row.version) else {
                continue;
            };
            let receipt = Receipt::new(row.reference.clone(), Ok(saved));
            self.records[index].receipt = Some(receipt.clone());
            let _ = self.persist_records();
            return Some(receipt);
        }
        None
    }

    fn acknowledged(&mut self, reference: &Reference) -> Result<(), FileError> {
        if let Some(row) = self
            .records
            .iter_mut()
            .find(|row| row.reference == *reference)
        {
            row.acknowledged = true;
            self.persist_records()?;
        }
        Ok(())
    }

    fn status(&self) -> Value {
        let grants: Vec<_> = self
            .settings
            .grants
            .iter()
            .filter(|g| g.binding == self.binding)
            .map(|g| json!({"id":g.id,"alias":g.alias,"write":g.write}))
            .collect();
        let recent: Vec<_> = self
            .records
            .iter()
            .rev()
            .filter(|r| r.binding == self.binding)
            .take(20)
            .map(|r| {
                json!({"id":r.version.id,"task_id":r.version.task_id,"path":r.version.path,
                "diff":r.version.diff,"sha256":r.version.after_hash,
                "status":r.receipt.as_ref().map(|a| a.code.as_str()).unwrap_or("outcome_unknown"),
                "synced":r.acknowledged,"undoable":r.version.before.is_some()
                    && r.receipt.as_ref().is_some_and(|a| a.code == "ok")})
            })
            .collect();
        let unrestricted = self.settings.unrestricted.as_ref().filter(|g| g.binding == self.binding);
        json!({"state":self.settings.state,"online":self.online,"grants":grants,"recent":recent,
            "action":self.action,"unrestricted":unrestricted.is_some(),
            "unrestricted_write":unrestricted.is_some_and(|g| g.write)})
    }
}

fn main_window(window: &WebviewWindow) -> Result<(), FileError> {
    if window.label() == crate::design_satellite::MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("path_denied")
    }
}

fn access<T>(
    app: &AppHandle,
    f: impl FnOnce(&mut Runtime) -> Result<T, FileError>,
) -> Result<T, FileError> {
    let executor = app.state::<Executor>();
    let mut guard = executor.0.lock().map_err(|_| "io_failed")?;
    if guard.is_none() {
        *guard = Some(Runtime::init(app)?);
    }
    f(guard.as_mut().ok_or("io_failed")?)
}

#[tauri::command]
pub fn device_file_status(window: WebviewWindow) -> Result<Value, FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| Ok(r.status()))
}

#[tauri::command]
pub fn device_file_mode(window: WebviewWindow, mode: Mode) -> Result<(), FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| {
        let mut settings = r.settings.clone();
        settings.state = mode;
        r.persist_settings(settings)
    })
}

#[tauri::command]
pub async fn device_file_pick(
    window: WebviewWindow,
    single: bool,
    write: bool,
) -> Result<(), FileError> {
    main_window(&window)?;
    let app = window.app_handle().clone();
    let binding = connection(&app).1;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let picker = app.dialog().file().set_parent(&window);
    let callback = move |picked: Option<tauri_plugin_dialog::FilePath>| {
        let _ = tx.send(picked);
    };
    if single {
        picker
            .add_filter(
                "Text files",
                &["html", "css", "js", "ts", "json", "md", "txt", "py"],
            )
            .pick_file(callback);
    } else {
        picker.pick_folder(callback);
    }
    let Some(picked) = rx.await.map_err(|_| "io_failed")? else {
        return Ok(());
    };
    if binding != connection(&app).1 {
        return Err("grant_changed");
    }
    let path = picked.into_path().map_err(|_| "path_denied")?;
    let home = app.path().home_dir().ok();
    let (root, file, identity) = files::approve(&path, single, home.as_deref())?;
    let alias = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("path_denied")?
        .to_owned();
    if alias.chars().count() > 100 {
        return Err("path_denied");
    }
    access(&app, |r| {
        let mut settings = r.settings.clone();
        if settings.grants.len() >= 15 && settings.unrestricted.is_some() || settings.grants.len() >= 16 {
            return Err("storage_full");
        }
        settings.grants.push(Grant {
            id: new_id()?,
            revision: new_id()?,
            root,
            file,
            identity,
            write,
            alias,
            binding,
            unrestricted: false,
        });
        r.persist_settings(settings)
    })
}

#[tauri::command]
pub fn device_file_unrestricted(
    window: WebviewWindow,
    enabled: bool,
    write: bool,
) -> Result<(), FileError> {
    main_window(&window)?;
    let app = window.app_handle();
    let binding = connection(app).1;
    let home = app.path().home_dir().map_err(|_| "path_denied")?;
    access(app, |r| {
        let mut settings = r.settings.clone();
        if enabled && settings.grants.len() >= 16 {
            return Err("storage_full");
        }
        settings.unrestricted = if enabled {
            Some(Grant {
                id: new_id()?,
                revision: new_id()?,
                identity: files::unrestricted_identity(&home)?,
                root: home,
                file: None,
                write,
                alias: "All local files".into(),
                binding,
                unrestricted: true,
            })
        } else {
            None
        };
        r.persist_settings(settings)
    })
}

#[tauri::command]
pub fn device_file_grant(
    window: WebviewWindow,
    id: String,
    write: Option<bool>,
) -> Result<(), FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| {
        let mut settings = r.settings.clone();
        let index = settings
            .grants
            .iter()
            .position(|g| g.id == id && g.binding == r.binding)
            .ok_or("grant_changed")?;
        if let Some(write) = write {
            settings.grants[index].write = write;
            settings.grants[index].revision = new_id()?;
        } else {
            settings.grants.remove(index);
        }
        r.persist_settings(settings)
    })
}

#[tauri::command]
pub fn device_file_undo_local(window: WebviewWindow, id: String) -> Result<(), FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| {
        let row = r
            .records
            .iter()
            .find(|r| r.version.id == id)
            .ok_or("not_found")?;
        let grant = r.grant(&row.reference).ok_or("grant_changed")?.clone();
        let mut reference = row.reference.clone();
        reference.nonce = new_id()?;
        let action = Action {
            op: "undo".into(),
            path: row.version.path.clone(),
            query: String::new(),
            start: 1,
            expected_sha256: None,
            before: String::new(),
            after: String::new(),
            version_id: Some(id),
        };
        r.record_mutation(reference, &grant, &action, true)
            .map(|_| ())
    })
}

#[tauri::command]
pub fn device_file_undo_task(window: WebviewWindow, task_id: String) -> Result<Value, FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| {
        let versions: Vec<_> = r
            .records
            .iter()
            .rev()
            .filter(|row| {
                row.reference.task_id == task_id
                    && row.binding == r.binding
                    && row.version.before.is_some()
                    && row.receipt.as_ref().is_some_and(|a| a.code == "ok")
            })
            .map(|row| (row.reference.clone(), row.version.clone()))
            .collect();
        let mut restored = 0;
        for (mut reference, version) in versions {
            let grant = r.grant(&reference).ok_or("grant_changed")?.clone();
            reference.nonce = new_id()?;
            let action = Action {
                op: "undo".into(),
                path: version.path,
                query: String::new(),
                start: 1,
                expected_sha256: None,
                before: String::new(),
                after: String::new(),
                version_id: Some(version.id),
            };
            if let Err(error) = r.record_mutation(reference, &grant, &action, true) {
                return Ok(json!({"restored":restored,"error":error}));
            }
            restored += 1;
        }
        Ok(json!({"restored":restored}))
    })
}

#[tauri::command]
pub fn device_file_clear(window: WebviewWindow) -> Result<(), FileError> {
    main_window(&window)?;
    access(window.app_handle(), |r| {
        r.records.retain(|row| !row.acknowledged);
        r.persist_records()
    })
}

#[derive(Deserialize)]
struct Poll {
    protocol: String,
    server_epoch: String,
    online: bool,
    command: Option<Command>,
}

fn secure(config: &crate::client_config::ClientConfig) -> bool {
    reqwest::Url::parse(&config.backend_base).is_ok_and(|url| {
        url.username().is_empty()
            && url.password().is_none()
            && (url.scheme() == "https"
                || (url.scheme() == "http"
                    && matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"))))
    })
}

async fn send(
    client: &reqwest::Client,
    config: &crate::client_config::ClientConfig,
    suffix: &str,
    payload: &impl Serialize,
) -> Result<Vec<u8>, FileError> {
    let wire = serde_json::to_vec(payload).map_err(|_| "invalid_action")?;
    if wire.len() > WIRE_LIMIT {
        return Err("invalid_action");
    }
    let url = crate::backend_url(config, &format!("/device-file-agent/{suffix}"));
    let mut response = crate::authorized_request(config, client.post(url))
        .header("Content-Type", "application/json")
        .body(wire)
        .send()
        .await
        .map_err(|_| "io_failed")?;
    if !response.status().is_success() {
        return Err("io_failed");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "io_failed")? {
        if bytes.len() + chunk.len() > WIRE_LIMIT {
            return Err("invalid_action");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(client) = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
        else {
            return;
        };
        let mut was_active = false;
        loop {
            let (config, binding) = connection(&app);
            let state = access(&app, |r| {
                if r.binding != binding {
                    r.binding = binding.clone();
                    r.epoch = new_id()?;
                    r.online = false;
                    r.seen.clear();
                }
                let grants: Vec<_> = r.settings.grants.iter().chain(r.settings.unrestricted.iter())
                    .filter(|g| g.binding == binding)
                    .map(|g| json!({"workspace_id":g.id,"revision":g.revision,"alias":g.alias,"write":g.write}))
                    .collect();
                Ok((
                    r.settings.state,
                    json!({"protocol":PROTOCOL,"device_id":r.settings.device_id,
                    "device_epoch":r.epoch,"state":r.settings.state,"grants":grants}),
                    r.pending(),
                ))
            });
            if let Ok((mode, request, pending)) = state {
                if secure(&config) && (was_active || mode == Mode::Enabled || pending.is_some()) {
                    let requested = Instant::now();
                    let response =
                        send(&client, &config, "poll", &request)
                            .await
                            .and_then(|wire| {
                                serde_json::from_slice::<Poll>(&wire).map_err(|_| "invalid_action")
                            });
                    let online = response
                        .as_ref()
                        .is_ok_and(|a| a.online && a.protocol == PROTOCOL);
                    let _ = access(&app, |r| {
                        r.online = online && r.settings.state == Mode::Enabled;
                        Ok(())
                    });
                    if let Some(receipt) = pending {
                        if send(&client, &config, "result", &receipt).await.is_ok() {
                            let _ = access(&app, |r| r.acknowledged(&receipt.reference));
                        }
                    }
                    if let Ok(Poll {
                        protocol,
                        server_epoch,
                        online: true,
                        command: Some(command),
                    }) = response
                    {
                        if protocol == PROTOCOL && connection(&app).1 == binding {
                            let window_app = app.clone();
                            let executed = tauri::async_runtime::spawn_blocking(move || {
                                access(&window_app, |r| {
                                    Ok(r.execute(&server_epoch, command, requested))
                                })
                            })
                            .await;
                            if let Ok(Ok(receipt)) = executed {
                                if send(&client, &config, "result", &receipt).await.is_ok() {
                                    let _ = access(&app, |r| r.acknowledged(&receipt.reference));
                                }
                            }
                        }
                    }
                }
                was_active = mode == Mode::Enabled;
            }
            tokio::time::sleep(Duration::from_millis(900)).await;
        }
    });
}

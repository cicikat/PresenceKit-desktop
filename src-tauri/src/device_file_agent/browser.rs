//! Grant-bound, isolated Playwright process. The worker never receives a local path.
use super::{files, Action, FileError, Grant, Reference};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

pub(super) struct Browser {
    child: Child,
    input: ChildStdin,
    output: Receiver<Option<Value>>,
    pub reference: Reference,
    paths: Vec<String>,
    created: Instant,
    #[cfg(windows)]
    _job: Job,
}

#[cfg(windows)]
struct Job(isize);

#[cfg(windows)]
impl Job {
    fn own(child: &Child) -> Result<Self, FileError> {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::{CloseHandle, HANDLE};
        use windows::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(|_| "io_failed")?;
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(handle, JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32).is_err()
                || AssignProcessToJobObject(handle, HANDLE(child.as_raw_handle())).is_err() {
                let _ = CloseHandle(handle);
                return Err("io_failed");
            }
            Ok(Self(handle.0 as isize))
        }
    }
}

#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        unsafe { let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(self.0 as *mut _)); }
    }
}

impl Drop for Browser {
    fn drop(&mut self) {
        // EOF lets the worker close its context, driver and browser, including on revocation.
        let _ = writeln!(self.input, "{}", json!({"task_id": self.reference.task_id,"seq": 30,"op":"close"}));
        for _ in 0..20 {
            if self.child.try_wait().ok().flatten().is_some() { return; }
            std::thread::sleep(Duration::from_millis(25));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub(super) fn available(executable: &std::path::Path) -> bool {
    cfg!(windows) && executable.is_file()
}

impl Browser {
    #[cfg(test)]
    pub fn process_id(&self) -> u32 { self.child.id() }

    pub fn current(&self, reference: &Reference) -> bool {
        self.created.elapsed() < Duration::from_secs(600)
            && self.reference.task_id == reference.task_id
            && self.reference.workspace_id == reference.workspace_id
            && self.reference.revision == reference.revision
            && self.reference.device_epoch == reference.device_epoch
            && self.reference.server_epoch == reference.server_epoch
    }

    fn start(executable: &PathBuf, reference: &Reference, paths: Vec<String>) -> Result<Self, FileError> {
        if !available(executable) { return Err("unsupported_operation"); }
        let mut command = Command::new(executable);
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .env("PLAYWRIGHT_BROWSERS_PATH", "0")
            .env_remove("HTTP_PROXY").env_remove("HTTPS_PROXY").env_remove("ALL_PROXY");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW; no interactive shell.
        }
        let mut child = command.spawn().map_err(|_| "io_failed")?;
        #[cfg(windows)]
        let job = match Job::own(&child) {
            Ok(job) => job,
            Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error); }
        };
        let input = child.stdin.take().ok_or("io_failed")?;
        let output = child.stdout.take().ok_or("io_failed")?;
        let (tx, rx) = mpsc::sync_channel(2);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                if reader.by_ref().take(65537).read_until(b'\n', &mut bytes).is_err()
                    || bytes.is_empty() || bytes.len() > 65536 { break; }
                let value = serde_json::from_slice(&bytes).ok();
                if tx.send(value).is_err() { break; }
            }
        });
        Ok(Self {child, input, output: rx, reference: reference.clone(), paths, created: Instant::now(),
            #[cfg(windows)] _job: job,
        })
    }

    fn send(&mut self, packet: Value) -> Result<Value, FileError> {
        serde_json::to_writer(&mut self.input, &packet).map_err(|_| "io_failed")?;
        self.input.write_all(b"\n").map_err(|_| "io_failed")?;
        self.input.flush().map_err(|_| "io_failed")?;
        let reply = self.output.recv_timeout(Duration::from_secs(20)).map_err(|_| "outcome_unknown")?
            .ok_or("protocol_mismatch")?;
        if reply["ok"] != true { return Err("invalid_action"); }
        reply.get("body").filter(|v| v.is_object()).cloned().ok_or("protocol_mismatch")
    }
}

pub(super) fn execute(slot: &mut Option<Browser>, executable: &PathBuf, grant: &Grant,
                      reference: &Reference, action: &Action) -> Result<Value, FileError> {
    // Unrestricted machine access is deliberately not a preview grant.
    if grant.unrestricted { return Err("path_denied"); }
    let mut packet: Value = serde_json::from_str(&action.query).map_err(|_| "invalid_action")?;
    let op = packet.get("op").and_then(Value::as_str).ok_or("invalid_action")?.to_owned();
    if op == "start" {
        if slot.is_some() { return Err("invalid_action"); }
        let resources: Vec<String> = serde_json::from_value(packet.get("resources").cloned().unwrap_or(json!([])))
            .map_err(|_| "invalid_action")?;
        let mut paths = vec![action.path.clone()];
        paths.extend(resources);
        if paths.len() > 40 { return Err("invalid_action"); }
        packet["files"] = files::preview_manifest(grant, &paths)?;
        *slot = Some(Browser::start(executable, reference, paths)?);
    }
    let session = slot.as_mut().ok_or("invalid_action")?;
    if !session.current(reference) { return Err("grant_changed"); }
    if op == "reload" { packet["files"] = files::preview_manifest(grant, &session.paths)?; }
    packet["task_id"] = json!(reference.task_id);
    packet["seq"] = json!(reference.seq);
    packet["path"] = json!(action.path);
    let result = session.send(packet);
    if op == "close" || result.is_err() { *slot = None; }
    result
}

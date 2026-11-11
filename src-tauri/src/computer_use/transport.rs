//! Dedicated scoped poll/receipt channel. A delivered native action is never retried.
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use super::{vision, Executor, Receipt, Scope, Status, Step};

#[derive(Deserialize)]
struct Poll {
    accepted: bool,
    server_epoch: String,
    reason: Option<String>,
    task_id: Option<String>,
    step: Option<Step>,
    nonce: Option<String>,
    expires_in_ms: Option<u64>,
    vision: Option<vision::Connection>,
}

struct Pending {
    seq: u32,
    task_id: String,
    nonce: String,
    worker: tauri::async_runtime::JoinHandle<Receipt>,
}

pub fn start(app: AppHandle, status: &Status, char_id: String) {
    let (Some(session), Some(device), Some(scope)) =
        (&status.session_id, &status.device_id, status.scope)
    else {
        return;
    };
    let session = session.clone();
    let device = device.clone();
    tauri::async_runtime::spawn(async move {
        let executor = app.state::<Executor>();
        let result = run(&app, &executor, &session, &device, scope, &char_id).await;
        if let Err(reason) = result {
            executor.stop_matching(&session, reason);
        }
    });
}

async fn run(
    app: &AppHandle,
    executor: &Executor,
    session: &str,
    device: &str,
    scope: Scope,
    char_id: &str,
) -> Result<(), &'static str> {
    let config = crate::load_client_config(app);
    let url = crate::backend_url(&config, "/computer-use/poll");
    let result_url = crate::backend_url(&config, "/computer-use/result");
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|_| "backend_unavailable")?;
    let mut epoch: Option<String> = None;
    let mut pending: Option<Pending> = None;
    let scope_name = match scope {
        Scope::Window { .. } => "window",
        Scope::Desktop => "desktop",
    };

    loop {
        let local = executor.status()?;
        let closed = local.session_id.as_deref() != Some(session) || local.state == "closed";
        let started = Instant::now();
        let request = crate::authorized_request(&config, client.post(&url)).json(&json!({
            "device_id": device, "session_id": session, "scope": scope_name, "char_id": char_id,
            "state": if closed { "closed" } else { local.state },
            "remaining_ms": if closed { 0 } else { local.remaining_ms },
            "focus_ready": local.focus_ready && !closed,
            "server_epoch": epoch,
        }));
        if closed {
            if epoch.is_some() {
                let _ = request.send().await;
            }
            return Ok(());
        }
        let response = request.send().await.map_err(|_| "backend_offline")?;
        if !response.status().is_success() {
            return Err("backend_denied");
        }
        let response: Poll = response
            .json()
            .await
            .map_err(|_| "backend_protocol_error")?;
        if !response.accepted {
            return Err(match response.reason.as_deref() {
                Some("server_restarted") => "backend_restarted",
                Some("authorization_ended") => "authorization_ended",
                _ => "backend_denied",
            });
        }
        if epoch
            .as_ref()
            .is_some_and(|value| value != &response.server_epoch)
        {
            return Err("backend_restarted");
        }
        epoch = Some(response.server_epoch);
        executor.sync_peer(
            session,
            response.task_id.clone(),
            started + Duration::from_secs(4),
        )?;

        if pending
            .as_ref()
            .is_some_and(|job| Some(&job.task_id) != response.task_id.as_ref())
        {
            // The blocking worker checks the local lease before input. Discard its result.
            pending = None;
        }
        if pending
            .as_ref()
            .is_some_and(|job| job.worker.inner().is_finished())
        {
            let job = pending.take().ok_or("backend_protocol_error")?;
            let receipt = job.worker.await.map_err(|_| "executor_unavailable")?;
            let reply = crate::authorized_request(&config, client.post(&result_url))
                .json(&json!({
                    "device_id": device, "session_id": session, "task_id": job.task_id,
                    "server_epoch": epoch, "nonce": job.nonce, "seq": job.seq, "receipt": receipt,
                }))
                .send()
                .await
                .map_err(|_| "backend_offline")?;
            if !reply.status().is_success() && reply.status() != reqwest::StatusCode::CONFLICT {
                return Err("backend_denied");
            }
        }

        if let Some(step) = response.step {
            let nonce = response.nonce.ok_or("backend_protocol_error")?;
            let ttl = response
                .expires_in_ms
                .filter(|value| (1..=22_000).contains(value))
                .ok_or("backend_protocol_error")?;
            if pending.is_some()
                || Some(&step.task_id) != response.task_id.as_ref()
                || step.device_id != device
                || step.session_id != session
            {
                return Err("backend_protocol_error");
            }
            let task_id = step.task_id.clone();
            let seq = step.seq;
            let app = app.clone();
            let worker = tauri::async_runtime::spawn_blocking(move || {
                app.state::<Executor>().step(
                    step,
                    response.vision.as_ref(),
                    started + Duration::from_millis(ttl),
                )
            });
            pending = Some(Pending {
                seq,
                task_id,
                nonce,
                worker,
            });
        }

        tokio::time::sleep(Duration::from_millis(if pending.is_some() {
            250
        } else {
            700
        }))
        .await;
    }
}

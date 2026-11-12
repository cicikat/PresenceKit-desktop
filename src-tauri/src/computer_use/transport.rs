//! Dedicated scoped poll/receipt channel. A delivered native action is never retried.
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use super::{vision, Cue, Executor, Receipt, Scope, Status, Step};
use crate::client_config::ClientConfig;

#[derive(Deserialize)]
struct Poll {
    accepted: bool,
    server_epoch: String,
    reason: Option<String>,
    task_id: Option<String>,
    agent_cue: Option<Cue>,
    step: Option<Step>,
    nonce: Option<String>,
    expires_in_ms: Option<u64>,
    vision: Option<vision::Connection>,
    vision_timeout_ms: Option<u64>,
}

struct Pending {
    seq: u32,
    task_id: String,
    nonce: String,
    worker: tauri::async_runtime::JoinHandle<Receipt>,
}

pub fn start(app: AppHandle, status: &Status, char_id: String) {
    let Some(session) = status.session_id.clone() else {
        return;
    };
    let grant = status.clone();
    tauri::async_runtime::spawn(async move {
        let executor = app.state::<Executor>().inner().clone();
        let config = crate::load_client_config(&app);
        let result = run(&config, &executor, &grant, &char_id).await;
        if let Err(reason) = result {
            executor.stop_matching(&session, reason);
        }
    });
}

pub(super) async fn run(
    config: &ClientConfig,
    executor: &Executor,
    grant: &Status,
    char_id: &str,
) -> Result<(), &'static str> {
    let (Some(session), Some(device), Some(scope)) = (
        grant.session_id.as_deref(),
        grant.device_id.as_deref(),
        grant.scope,
    ) else {
        return Err("authorization_ended");
    };
    let cloud_vision = grant.cloud_vision;
    let url = crate::backend_url(config, "/computer-use/poll");
    let result_url = crate::backend_url(config, "/computer-use/result");
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        // Allow a short busy backend while leaving the four-second local peer
        // lease in charge of whether the worker may still inject input.
        .timeout(Duration::from_millis(3200))
        .build()
        .map_err(|_| "backend_unavailable")?;
    let mut epoch: Option<String> = None;
    let mut pending: Option<Pending> = None;
    let mut agent_active = false;
    let scope_name = match scope {
        Scope::Window { .. } => "window",
        Scope::Desktop => "desktop",
    };

    loop {
        let local = executor.status()?;
        let closed = local.session_id.as_deref() != Some(session) || local.state == "closed";
        let started = Instant::now();
        let mut poll = json!({
            "device_id": device, "session_id": session, "scope": scope_name, "char_id": char_id,
            "state": if closed { "closed" } else { local.state },
            "remaining_ms": if closed { 0 } else { local.remaining_ms },
            "focus_ready": local.focus_ready && !closed,
            "server_epoch": epoch,
        });
        if let Some(granted) = cloud_vision {
            poll["cloud_vision"] = json!(granted);
        }
        if closed && agent_active && local.session_id.as_deref() == Some(session)
            && matches!(local.reason, Some("escape_cancel" | "emergency_stop" | "user_stopped"))
        {
            poll["stop_agent"] = json!(true);
        }
        let request = crate::authorized_request(config, client.post(&url)).json(&poll);
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
        agent_active = response.agent_cue.is_some();
        if executor.sync_peer(
            session,
            response.task_id.clone(),
            response.agent_cue,
            started + Duration::from_secs(4),
        ).is_err() {
            // A local Esc or Stop during this poll still needs the close request.
            continue;
        }

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
            let reply = crate::authorized_request(config, client.post(&result_url))
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
            let is_cloud = response
                .vision
                .as_ref()
                .is_some_and(vision::Connection::is_cloud);
            let ttl_limit = if is_cloud { 35_000 } else { 22_000 };
            let ttl = response
                .expires_in_ms
                .filter(|value| (1..=ttl_limit).contains(value))
                .ok_or("backend_protocol_error")?;
            let vision_ms = match (is_cloud, response.vision_timeout_ms) {
                (true, Some(ms @ 1..=25_000)) => ms + 3_000,
                (false, Some(ms @ 1..=18_000)) => ms,
                (false, None) => 18_000,
                _ => return Err("backend_protocol_error"),
            };
            if pending.is_some()
                || Some(&step.task_id) != response.task_id.as_ref()
                || step.device_id != device
                || step.session_id != session
            {
                return Err("backend_protocol_error");
            }
            let task_id = step.task_id.clone();
            let seq = step.seq;
            let server_epoch = epoch.clone().ok_or("backend_protocol_error")?;
            let request_nonce = nonce.clone();
            let vision_config = config.clone();
            let executor = executor.clone();
            let worker = tauri::async_runtime::spawn_blocking(move || {
                let locator = response.vision.as_ref().map(|connection| vision::Locator {
                    connection,
                    timeout: Duration::from_millis(vision_ms),
                    proxy: (is_cloud && cloud_vision == Some(true)).then_some(vision::Proxy {
                        config: &vision_config,
                        epoch: &server_epoch,
                        nonce: &request_nonce,
                    }),
                });
                executor.step(step, locator.as_ref(), started + Duration::from_millis(ttl))
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

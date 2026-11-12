//! Local, process-scoped authorization and sequenced execution.
mod native;
#[cfg(windows)]
mod overlay;
mod transport;
mod vision;

use std::collections::HashSet;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewWindow};

const MAX_STEPS: u32 = 40;
const FRAME_TTL: Duration = Duration::from_secs(24);
const CLOUD_FRAME_TTL: Duration = Duration::from_secs(52);
const TASK_TTL: Duration = Duration::from_secs(180);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WindowId {
    handle: u64,
    pid: u32,
    thread: u32,
    created: [u32; 2],
}

#[derive(Debug, Serialize)]
pub struct WindowChoice {
    id: WindowId,
    title: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Scope {
    Window { window: WindowId },
    Desktop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Bounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Surface {
    window: WindowId,
    bounds: Bounds,
    desktop: Bounds,
    dpi: u32,
    focused: u64,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
pub struct Node {
    id: u32,
    name: String,
    control_type: i32,
    value: Option<String>,
    bounds: Bounds,
    focused: bool,
}

#[derive(Serialize)]
pub struct Observation {
    version: u32,
    jpeg_width: u32,
    jpeg_height: u32,
    captured_at_ms: u64,
    surface: Surface,
    nodes: Vec<Node>,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Target {
    Element { id: u32 },
    Point { x: f64, y: f64 },
    Visual { description: String },
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Button {
    #[default]
    Left,
    Right,
    Middle,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Observe {},
    VerifyVisual {},
    Click {
        target: Target,
        #[serde(default)]
        button: Button,
    },
    DoubleClick {
        target: Target,
    },
    Move {
        target: Target,
    },
    Scroll {
        target: Target,
        ticks: i32,
    },
    TypeText {
        text: String,
    },
    PressKey {
        key: String,
    },
    Hotkey {
        keys: Vec<String>,
    },
    Drag {
        from: Target,
        to: Target,
    },
    Wait {
        ms: u64,
    },
}

impl Action {
    fn targets(&mut self) -> impl Iterator<Item = &mut Target> {
        let targets = match self {
            Self::Click { target, .. }
            | Self::DoubleClick { target }
            | Self::Move { target }
            | Self::Scroll { target, .. } => [Some(target), None],
            Self::Drag { from, to } => [Some(from), Some(to)],
            _ => [None, None],
        };
        targets.into_iter().flatten()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub device_id: String,
    pub session_id: String,
    pub task_id: String,
    pub seq: u32,
    pub frame: Option<u32>,
    pub action: Action,
}

#[derive(Serialize)]
pub struct Receipt {
    status: &'static str,
    reason: Option<&'static str>,
    observation: Option<Observation>,
}

impl Receipt {
    fn error(status: &'static str, reason: &'static str) -> Self {
        Self {
            status,
            reason: Some(reason),
            observation: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct Executor {
    session: Arc<Mutex<Option<Session>>>,
    worker: Arc<Mutex<()>>,
}

struct Session {
    id: String,
    device_id: String,
    scope: Scope,
    cloud_vision: Option<bool>,
    expires: Instant,
    paused: bool,
    stopped: Option<&'static str>,
    activity: u64,
    emergency: u64,
    escape: u64,
    pause_toggle: u64,
    revision: u64,
    task: Option<Task>,
    seen_tasks: HashSet<String>,
    peer: Option<Peer>,
}

struct Peer {
    expires: Instant,
    task_id: Option<String>,
    agent_cue: Option<Cue>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Cue {
    Active,
    Weak,
    #[serde(skip)]
    Legacy,
}

struct Task {
    id: String,
    next: u32,
    deadline: Instant,
    frame: Option<Frame>,
}

struct Frame {
    at: Instant,
    version: u32,
    surface: Surface,
    nodes: Vec<Node>,
    digest: [u8; 32],
    desktop_scope: bool,
    jpeg: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Status {
    supported: bool,
    #[serde(skip_serializing)]
    session_id: Option<String>,
    #[serde(skip_serializing)]
    device_id: Option<String>,
    scope: Option<Scope>,
    cloud_vision: Option<bool>,
    state: &'static str,
    reason: Option<&'static str>,
    remaining_ms: u64,
    focus_ready: bool,
    task_id: Option<String>,
    steps: u32,
}

impl Session {
    fn check(&mut self) {
        if self.stopped.is_some() {
            return;
        }
        self.stopped = if self.escape != native::escape() {
            Some("escape_cancel")
        } else if self.emergency != native::emergency() {
            Some("emergency_stop")
        } else if self
            .peer
            .as_ref()
            .is_some_and(|peer| peer.expires <= Instant::now())
        {
            Some("backend_offline")
        } else if self.expires <= Instant::now() {
            Some("expired")
        } else if !native::unlocked() {
            Some("desktop_locked")
        } else if self.task.is_some() && native::surface(self.scope).is_err() {
            Some("scope_changed")
        } else if self
            .task
            .as_ref()
            .is_some_and(|t| t.deadline <= Instant::now())
        {
            Some("task_expired")
        } else {
            None
        };
        if self.stopped.is_some() {
            native::arm_monitor(0);
            if let Some(task) = &mut self.task {
                task.frame = None;
            }
        } else {
            let toggle = native::pause_toggle();
            if self.pause_toggle != toggle {
                let flipped = (toggle.wrapping_sub(self.pause_toggle) % 2) == 1;
                self.pause_toggle = toggle;
                self.activity = native::activity();
                self.set_paused(self.paused ^ flipped);
            } else if self.task.is_some() && self.activity != native::activity() {
                self.activity = native::activity();
                self.set_paused(true);
            }
        }
    }

    fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        if paused {
            native::arm_escape(None, Duration::ZERO);
        }
        self.revision = self.revision.wrapping_add(1);
        if let Some(task) = &mut self.task {
            task.frame = None;
        }
    }

    fn active(&mut self) -> Result<(), Receipt> {
        self.check();
        if let Some(reason) = self.stopped {
            return Err(Receipt::error("canceled", reason));
        }
        if self.paused {
            return Err(Receipt::error("canceled", "paused"));
        }
        Ok(())
    }
}

impl Executor {
    fn session(&self) -> Result<MutexGuard<'_, Option<Session>>, &'static str> {
        self.session.lock().map_err(|_| "executor_unavailable")
    }

    fn open(
        &self,
        scope: Scope,
        duration_seconds: u64,
        cloud_vision: Option<bool>,
    ) -> Result<Status, &'static str> {
        if !(30..=900).contains(&duration_seconds) {
            return Err("invalid_duration");
        }
        if let Scope::Window { window } = scope {
            if !native::valid_window(window) {
                return Err("window_unavailable");
            }
        }
        native::start_monitor()?;
        if !native::unlocked() {
            return Err("desktop_locked");
        }
        let mut session = self.session()?;
        if let Some(active) = session.as_mut() {
            active.check();
            if active.stopped.is_none() {
                return Err("session_already_open");
            }
        }
        let device_id = session
            .as_ref()
            .map(|s| s.device_id.clone())
            .map_or_else(random_id, Ok)?;
        native::arm_monitor(duration_seconds);
        *session = Some(Session {
            id: random_id()?,
            device_id,
            scope,
            cloud_vision,
            expires: Instant::now() + Duration::from_secs(duration_seconds),
            paused: false,
            stopped: None,
            activity: native::activity(),
            emergency: native::emergency(),
            escape: native::escape(),
            pause_toggle: native::pause_toggle(),
            revision: 0,
            task: None,
            seen_tasks: HashSet::new(),
            peer: None,
        });
        drop(session);
        self.status()
    }

    pub fn status(&self) -> Result<Status, &'static str> {
        let mut guard = self.session()?;
        let Some(session) = guard.as_mut() else {
            return Ok(Status {
                supported: cfg!(windows),
                session_id: None,
                device_id: None,
                scope: None,
                cloud_vision: None,
                state: "closed",
                reason: None,
                remaining_ms: 0,
                focus_ready: false,
                task_id: None,
                steps: 0,
            });
        };
        session.check();
        Ok(Status {
            supported: cfg!(windows),
            session_id: Some(session.id.clone()),
            device_id: Some(session.device_id.clone()),
            scope: Some(session.scope),
            cloud_vision: if session.stopped.is_none() {
                session.cloud_vision
            } else {
                None
            },
            state: if session.stopped.is_some() {
                "closed"
            } else if session.paused {
                "paused"
            } else if session.task.is_some() {
                "running"
            } else {
                "ready"
            },
            reason: session.stopped.or(session.paused.then_some("paused")),
            remaining_ms: if session.stopped.is_some() {
                0
            } else {
                session
                    .expires
                    .saturating_duration_since(Instant::now())
                    .as_millis() as u64
            },
            focus_ready: session.stopped.is_none() && native::surface(session.scope).is_ok(),
            task_id: session.task.as_ref().map(|t| t.id.clone()),
            steps: session.task.as_ref().map_or(0, |t| t.next - 1),
        })
    }

    fn control(&self, control: Control) -> Result<Status, &'static str> {
        if let Some(session) = self.session()?.as_mut() {
            session.check();
            match control {
                Control::Stop => {
                    session.stopped = Some("user_stopped");
                    native::arm_monitor(0);
                }
                Control::Pause => session.set_paused(true),
                Control::Resume if session.stopped.is_none() => {
                    session.activity = native::activity();
                    session.set_paused(false);
                }
                Control::Resume => {}
            }
            if let Some(task) = session.task.as_mut() {
                task.frame = None;
            }
        }
        self.status()
    }

    pub fn stop(&self) {
        let _ = self.control(Control::Stop);
    }

    fn stop_matching(&self, session_id: &str, reason: &'static str) {
        if let Ok(mut guard) = self.session() {
            if let Some(session) = guard
                .as_mut()
                .filter(|session| session.id == session_id && session.stopped.is_none())
            {
                session.stopped = Some(reason);
                session.task = None;
                native::arm_monitor(0);
            }
        }
    }

    fn sync_peer(
        &self,
        session_id: &str,
        task_id: Option<String>,
        agent_cue: Option<Cue>,
        expires: Instant,
    ) -> Result<(), &'static str> {
        let mut guard = self.session()?;
        let session = guard
            .as_mut()
            .filter(|session| session.id == session_id)
            .ok_or("authorization_ended")?;
        session.check();
        if session.stopped.is_some() {
            return Err("authorization_ended");
        }
        if session
            .task
            .as_ref()
            .is_some_and(|task| Some(&task.id) != task_id.as_ref())
        {
            session.task = None;
        }
        session.peer = Some(Peer { expires, task_id, agent_cue });
        if session
            .peer
            .as_ref()
            .is_some_and(|peer| peer.task_id.is_none() && peer.agent_cue.is_none())
        {
            native::arm_escape(None, Duration::ZERO);
        }
        Ok(())
    }

    #[cfg(windows)]
    fn cue(&self, session_id: &str) -> Option<Option<Cue>> {
        let mut guard = self.session().ok()?;
        let session = guard.as_mut().filter(|session| session.id == session_id)?;
        session.check();
        if session.stopped.is_some() {
            return None;
        }
        let Some(peer) = session.peer.as_ref() else { return Some(None) };
        let remaining = peer.expires.saturating_duration_since(Instant::now());
        if let Some(cue) = peer.agent_cue {
            native::arm_escape(Some(Scope::Desktop), remaining);
            return Some(Some(if session.paused { Cue::Weak } else { cue }));
        }
        let legacy = !session.paused && peer.task_id.is_some() && native::surface(session.scope).is_ok();
        native::arm_escape(None, Duration::ZERO);
        Some(legacy.then_some(Cue::Legacy))
    }

    #[cfg(test)]
    fn finish(&self, session_id: &str, task_id: &str) {
        if let Ok(mut guard) = self.session() {
            if let Some(session) = guard.as_mut().filter(|s| s.id == session_id) {
                if session.task.as_ref().is_some_and(|task| task.id == task_id) {
                    session.task = None;
                }
            }
        }
    }

    pub fn step(
        &self,
        step: Step,
        vision: Option<&vision::Locator<'_>>,
        expires: Instant,
    ) -> Receipt {
        let mut input_attempted = false;
        match self.execute(step, vision, expires, &mut input_attempted) {
            Ok(receipt) => receipt,
            Err(_) if input_attempted => Receipt::error("failed", "outcome_unknown"),
            Err(receipt) => receipt,
        }
    }

    fn execute(
        &self,
        step: Step,
        vision: Option<&vision::Locator<'_>>,
        expires: Instant,
        input_attempted: &mut bool,
    ) -> Result<Receipt, Receipt> {
        if Instant::now() >= expires {
            return Err(Receipt::error("stale", "delivery_expired"));
        }
        let _worker = self
            .worker
            .try_lock()
            .map_err(|_| Receipt::error("failed", "busy"))?;
        let (scope, previous, revision, cloud_vision) = {
            let mut guard = self.session().map_err(|e| Receipt::error("failed", e))?;
            let session = match_session(&mut guard, &step)?;
            session.check();
            if let Some(reason) = session.stopped {
                return Err(Receipt::error("canceled", reason));
            }
            if step.seq == 1
                && session.task.is_none()
                && matches!(step.action, Action::Observe {})
                && (1..=80).contains(&step.task_id.len())
                && session.seen_tasks.len() < 128
                && !session.seen_tasks.contains(&step.task_id)
            {
                // The owner may focus the approved window before the first step.
                native::surface(session.scope).map_err(|e| Receipt::error("stale", e))?;
                session.activity = native::activity();
                session.seen_tasks.insert(step.task_id.clone());
                session.task = Some(Task {
                    id: step.task_id.clone(),
                    next: 1,
                    deadline: Instant::now() + TASK_TTL,
                    frame: None,
                });
            }
            let task = match_task(session, &step)?;
            if task.next != step.seq || step.seq > MAX_STEPS {
                return Err(Receipt::error("stale", "invalid_sequence"));
            }
            task.next += 1;
            let previous = task.frame.take();
            if session.paused {
                return Err(Receipt::error("canceled", "paused"));
            }
            (
                session.scope,
                previous,
                session.revision,
                session.cloud_vision == Some(true),
            )
        };

        let before = native::surface(scope).map_err(|e| Receipt::error("stale", e))?;
        let mut action = step.action.clone();
        let observing = matches!(action, Action::Observe {});
        if !observing {
            let frame = previous
                .as_ref()
                .filter(|f| {
                    Some(f.version) == step.frame
                        && f.at.elapsed() <= FRAME_TTL
                        && f.surface == before
                })
                .ok_or_else(|| Receipt::error("stale", "observation_changed"))?;
            let mut current_nodes = None;
            let mut located_in_cloud = false;
            let mut vision_deadline = None;
            for (target_index, target) in action.targets().enumerate() {
                if let Target::Visual { description } = target {
                    let name = description.trim();
                    if name.is_empty() || name.len() > 256 {
                        return Err(Receipt::error("failed", "invalid_description"));
                    }
                    let mut candidates = frame
                        .nodes
                        .iter()
                        .filter(|node| node.name.eq_ignore_ascii_case(name));
                    *target = match (candidates.next(), candidates.next()) {
                        (Some(node), None) => Target::Element { id: node.id },
                        _ => {
                            let locator = vision
                                .ok_or_else(|| Receipt::error("failed", "vision_not_configured"))?;
                            if locator.is_cloud() {
                                if !cloud_vision {
                                    return Err(Receipt::error(
                                        "failed",
                                        "cloud_vision_not_authorized",
                                    ));
                                }
                                recheck_image(scope, before, frame.digest)?;
                                located_in_cloud = true;
                            }
                            let deadline = *vision_deadline.get_or_insert_with(|| {
                                let now = Instant::now();
                                (now + locator.timeout).min(
                                    expires
                                        .checked_sub(Duration::from_millis(500))
                                        .unwrap_or(now),
                                )
                            });
                            self.recheck(&step, before, (expires, revision), |_| Ok(()))?;
                            let timeout = deadline.saturating_duration_since(Instant::now());
                            if timeout.is_zero() {
                                return Err(Receipt::error("failed", "vision_timeout"));
                            }
                            self.await_vision(&step, before, (expires, revision),
                                locator.locate(&step, target_index, &frame.jpeg, name, timeout))?
                        }
                    };
                }
                match target {
                    Target::Element { id } => {
                        let original = frame.nodes.iter().find(|node| node.id == *id);
                        if original.is_none()
                            || !current_nodes
                                .get_or_insert_with(|| native::nodes(before))
                                .iter()
                                .any(|node| Some(node) == original)
                        {
                            return Err(Receipt::error("stale", "element_changed"));
                        }
                    }
                    Target::Point { .. } => {}
                    Target::Visual { .. } => {
                        return Err(Receipt::error("failed", "vision_unresolved"))
                    }
                }
            }
            if matches!(action, Action::VerifyVisual {}) {
                if !cloud_vision {
                    return Err(Receipt::error("failed", "cloud_vision_not_authorized"));
                }
                let locator = vision.ok_or_else(|| Receipt::error("failed", "vision_not_configured"))?;
                recheck_image(scope, before, frame.digest)?;
                let timeout = locator.timeout.min(expires.saturating_duration_since(Instant::now())
                    .saturating_sub(Duration::from_millis(500)));
                if timeout.is_zero() {
                    return Err(Receipt::error("failed", "vision_timeout"));
                }
                self.await_vision(&step, before, (expires, revision), locator.verify(&step, &frame.jpeg, timeout))?;
                recheck_image(scope, before, frame.digest)?;
            } else if let Action::Wait { ms } = &action {
                if *ms > 2_000 {
                    return Err(Receipt::error("failed", "invalid_wait"));
                }
                let deadline = Instant::now() + Duration::from_millis(*ms);
                while Instant::now() < deadline {
                    self.recheck(&step, before, (expires, revision), |_| Ok(()))?;
                    std::thread::sleep(Duration::from_millis(20));
                }
            } else if let Action::TypeText { text } = &action {
                if text.is_empty() || text.len() > 256 {
                    return Err(Receipt::error("failed", "invalid_text"));
                }
                // Some Windows controls resolve VK_PACKET lazily. Space scalar
                // batches so the control consumes one before the next arrives.
                for scalar in text.chars() {
                    self.recheck(&step, before, (expires, revision), |_| {
                        let mut buffer = [0u16; 2];
                        native::type_scalar(scalar.encode_utf16(&mut buffer), input_attempted)
                            .map_err(|reason| Receipt::error("failed", reason))
                    })?;
                    std::thread::sleep(Duration::from_millis(48));
                }
                std::thread::sleep(Duration::from_millis(100));
            } else {
                if action
                    .targets()
                    .any(|target| matches!(target, Target::Point { .. }))
                {
                    self.recheck(&step, before, (expires, revision), |_| Ok(()))?;
                    recheck_image(scope, before, frame.digest)?;
                }
                self.recheck(&step, before, (expires, revision), |_| {
                    let frame_ttl = if located_in_cloud {
                        CLOUD_FRAME_TTL
                    } else {
                        FRAME_TTL
                    };
                    if frame.at.elapsed() > frame_ttl {
                        return Err(Receipt::error("stale", "observation_expired"));
                    }
                    native::perform(&action, frame, input_attempted)
                        .map_err(|e| Receipt::error("failed", e))
                })?;
                // Let the target drain the input queue before observing the result.
                std::thread::sleep(Duration::from_millis(140));
            }
        }

        let after = native::surface(scope).map_err(|reason| {
            let _ = self.status();
            Receipt::error("canceled", reason)
        })?;
        let (jpeg, digest) =
            native::capture(scope, after).map_err(|e| Receipt::error("failed", e))?;
        let captured = Instant::now();
        let captured_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let (jpeg_width, jpeg_height) =
            image::ImageReader::with_format(std::io::Cursor::new(&jpeg), image::ImageFormat::Jpeg)
                .into_dimensions()
                .map_err(|_| Receipt::error("failed", "invalid_frame"))?;
        let nodes = native::nodes(after);
        let changed = previous
            .as_ref()
            .is_some_and(|f| f.surface != after || f.digest != digest);
        self.recheck(&step, after, (expires, revision), |task| {
            task.frame = Some(Frame {
                at: captured,
                version: step.seq,
                surface: after,
                digest,
                desktop_scope: matches!(scope, Scope::Desktop),
                nodes: nodes.clone(),
                jpeg,
            });
            Ok(())
        })?;
        Ok(Receipt {
            status: if changed { "changed" } else { "ok" },
            reason: None,
            observation: Some(Observation {
                version: step.seq,
                jpeg_width,
                jpeg_height,
                captured_at_ms,
                surface: after,
                nodes,
            }),
        })
    }

    fn await_vision<T>(
        &self, step: &Step, surface: Surface, binding: (Instant, u64),
        call: impl std::future::Future<Output = Result<T, &'static str>>,
    ) -> Result<T, Receipt> {
        self.recheck(step, surface, binding, |_| Ok(()))?;
        tauri::async_runtime::block_on(async {
            tokio::pin!(call);
            loop {
                tokio::select! {
                    result = &mut call => break result.map_err(|reason| Receipt::error("failed", reason)),
                    _ = tokio::time::sleep(Duration::from_millis(100)) => {
                        self.recheck(step, surface, binding, |_| Ok(()))?;
                    }
                }
            }
        })
    }

    fn recheck(
        &self,
        step: &Step,
        expected: Surface,
        (expires, revision): (Instant, u64),
        apply: impl FnOnce(&mut Task) -> Result<(), Receipt>,
    ) -> Result<(), Receipt> {
        let mut guard = self.session().map_err(|e| Receipt::error("failed", e))?;
        let session = match_session(&mut guard, step)?;
        session.active()?;
        if native::surface(session.scope) != Ok(expected) {
            return Err(Receipt::error("stale", "observation_changed"));
        }
        session.active()?;
        if Instant::now() >= expires {
            return Err(Receipt::error("stale", "delivery_expired"));
        }
        if session.revision != revision {
            return Err(Receipt::error("stale", "session_resumed"));
        }
        apply(match_task(session, step)?)
    }
}

fn recheck_image(scope: Scope, surface: Surface, digest: [u8; 32]) -> Result<(), Receipt> {
    let (_, current) = native::capture(scope, surface).map_err(|e| Receipt::error("failed", e))?;
    if current != digest {
        return Err(Receipt::error("stale", "image_changed"));
    }
    Ok(())
}

fn match_session<'a>(
    session: &'a mut Option<Session>,
    step: &Step,
) -> Result<&'a mut Session, Receipt> {
    session
        .as_mut()
        .filter(|s| {
            s.id == step.session_id
                && s.device_id == step.device_id
                && s.peer
                    .as_ref()
                    .is_none_or(|peer| peer.task_id.as_deref() == Some(&step.task_id))
        })
        .ok_or_else(|| Receipt::error("canceled", "no_matching_session"))
}

fn match_task<'a>(session: &'a mut Session, step: &Step) -> Result<&'a mut Task, Receipt> {
    session
        .task
        .as_mut()
        .filter(|task| task.id == step.task_id)
        .ok_or_else(|| Receipt::error("stale", "no_matching_task"))
}

fn random_id() -> Result<String, &'static str> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| "random_unavailable")?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Control {
    Pause,
    Resume,
    Stop,
}

fn check_control_window(window: &WebviewWindow) -> Result<(), &'static str> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("invalid_control_window")
    }
}

#[tauri::command]
pub fn computer_use_windows(window: WebviewWindow) -> Result<Vec<WindowChoice>, &'static str> {
    check_control_window(&window)?;
    native::windows()
}

#[tauri::command]
pub fn computer_use_open(
    window: WebviewWindow,
    scope: Option<Scope>,
    duration_seconds: u64,
    char_id: String,
    cloud_vision: Option<bool>,
    overlay_label: Option<String>,
) -> Result<Status, &'static str> {
    check_control_window(&window)?;
    if char_id.is_empty() || char_id.len() > 80 {
        return Err("invalid_character");
    }
    let scope = match scope {
        Some(scope) => scope,
        None => Scope::Window {
            window: native::foreground_window()?,
        },
    };
    let status = window
        .state::<Executor>()
        .open(scope, duration_seconds, cloud_vision)?;
    transport::start(window.app_handle().clone(), &status, char_id);
    #[cfg(windows)]
    if let Some(session_id) = status.session_id.clone() {
        let label = overlay_label
            .unwrap_or_default()
            .chars()
            .take(160)
            .collect();
        overlay::start(window.app_handle().clone(), session_id, label);
    }
    #[cfg(not(windows))]
    let _ = overlay_label;
    Ok(status)
}

#[tauri::command]
pub fn computer_use_status(window: WebviewWindow) -> Result<Status, &'static str> {
    if window.label() != "pet" {
        check_control_window(&window)?;
    }
    window.state::<Executor>().status()
}

#[tauri::command]
pub fn computer_use_control(
    window: WebviewWindow,
    control: Control,
) -> Result<Status, &'static str> {
    if window.label() != "pet" || !matches!(control, Control::Stop) {
        check_control_window(&window)?;
    }
    window.state::<Executor>().control(control)
}

#[tauri::command]
pub async fn computer_use_backend_status(
    window: WebviewWindow,
) -> Result<serde_json::Value, &'static str> {
    check_control_window(&window)?;
    backend_status(window, "/computer-use/status").await
}

#[tauri::command]
pub async fn computer_use_agent_status(
    window: WebviewWindow,
) -> Result<serde_json::Value, &'static str> {
    if window.label() != "pet" {
        check_control_window(&window)?;
    }
    backend_status(window, "/computer-use/agent-session").await
}

#[tauri::command]
pub async fn computer_use_agent_control(
    window: WebviewWindow,
    session_id: String,
    action: String,
) -> Result<serde_json::Value, &'static str> {
    if window.label() != "pet" {
        check_control_window(&window)?;
    }
    if !matches!(action.as_str(), "resume" | "pause" | "cancel") {
        return Err("invalid_control");
    }
    let cfg = crate::load_client_config(window.app_handle());
    let url = crate::backend_url(&cfg, "/computer-use/agent-session/control");
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "backend_unavailable")?;
    let response = crate::authorized_request(&cfg, client.post(url))
        .json(&serde_json::json!({"session_id": session_id, "action": action,
            "request_id": random_id()?}))
        .send()
        .await
        .map_err(|_| "backend_unavailable")?;
    if !response.status().is_success() {
        return Err("backend_denied");
    }
    response.json().await.map_err(|_| "backend_protocol_error")
}

async fn backend_status(
    window: WebviewWindow,
    path: &str,
) -> Result<serde_json::Value, &'static str> {
    let cfg = crate::load_client_config(window.app_handle());
    let url = crate::backend_url(&cfg, path);
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "backend_unavailable")?;
    let response = crate::authorized_request(&cfg, client.get(url))
        .send()
        .await
        .map_err(|_| "backend_unavailable")?;
    if !response.status().is_success() {
        return Err("backend_denied");
    }
    response.json().await.map_err(|_| "backend_protocol_error")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_action_schema() {
        assert!(serde_json::from_str::<Action>(
            r#"{"kind":"click","target":{"kind":"point","x":0.3,"y":0.5}}"#
        )
        .is_ok());
        assert!(serde_json::from_str::<Action>(
            r#"{"kind":"click","target":{"kind":"point","x":0.3,"y":0.5,"version":1}}"#
        )
        .is_err());
        assert!(serde_json::from_str::<Action>(r#"{"kind":"observe","desktop":true}"#).is_err());
        assert!(serde_json::from_str::<Action>(r#"{"kind":"run","command":"test"}"#).is_err());
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires an unlocked interactive desktop and changes focus to a temporary Notepad document"]
    fn notepad_smoke() {
        let existing = std::env::var("PRESENCEKIT_CU_NOTEPAD_FIXTURE").ok();
        let name = existing
            .clone()
            .unwrap_or_else(|| format!("presencekit-cu-{}.txt", random_id().unwrap()));
        assert!(
            name.starts_with("presencekit-cu-")
                && name.ends_with(".txt")
                && !name.contains(['/', '\\'])
        );
        let path = std::env::temp_dir().join(&name);
        if existing.is_none() {
            std::fs::write(&path, "initial").unwrap();
            std::process::Command::new("notepad.exe")
                .arg(&path)
                .spawn()
                .unwrap();
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut reason = "fixture_window_unavailable";
        let window = loop {
            if let Ok(choices) = native::windows() {
                if let Some(choice) = choices
                    .into_iter()
                    .find(|choice| choice.title.contains(&name))
                {
                    match native::surface(Scope::Window { window: choice.id }) {
                        Ok(_) => break choice.id,
                        Err(error) => reason = error,
                    }
                }
            }
            assert!(
                Instant::now() < deadline,
                "temporary Notepad unavailable: {reason}"
            );
            std::thread::sleep(Duration::from_millis(100));
        };
        let executor = Executor::default();
        let session = executor.open(Scope::Window { window }, 60, None).unwrap();
        let session_id = session.session_id.unwrap();
        let device_id = session.device_id.unwrap();
        let run = |seq, frame, action| {
            executor.step(
                Step {
                    device_id: device_id.clone(),
                    session_id: session_id.clone(),
                    task_id: "smoke".into(),
                    seq,
                    frame,
                    action,
                },
                None,
                Instant::now() + Duration::from_secs(20),
            )
        };
        let steps = [
            Action::Observe {},
            Action::Hotkey {
                keys: vec!["Ctrl".into(), "A".into()],
            },
            Action::TypeText {
                text: "PresenceKit computer use".into(),
            },
            Action::Hotkey {
                keys: vec!["Ctrl".into(), "S".into()],
            },
        ];
        let mut frame = None;
        for (index, action) in steps.into_iter().enumerate() {
            let started = Instant::now();
            let receipt = run(index as u32 + 1, frame, action);
            assert!(
                matches!(receipt.status, "ok" | "changed"),
                "{} {:?}",
                receipt.status,
                receipt.reason
            );
            let observation = receipt.observation.unwrap();
            assert!(observation.jpeg_width > 0 && observation.jpeg_height > 0);
            eprintln!(
                "step {}: {}, {} ms, {} UIA nodes, {} DPI",
                index + 1,
                receipt.status,
                started.elapsed().as_millis(),
                observation.nodes.len(),
                observation.surface.dpi
            );
            frame = Some(observation.version);
        }
        assert_eq!(
            std::fs::read_to_string(&path).unwrap().trim(),
            "PresenceKit computer use"
        );
        assert_eq!(run(4, frame, Action::Observe {}).status, "stale");
        executor.finish(&session_id, "smoke");
        assert_eq!(run(1, None, Action::Observe {}).status, "stale");
        executor.stop();
        assert_eq!(run(5, frame, Action::Observe {}).status, "canceled");
        std::fs::remove_file(path).unwrap();
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires the local browser fixture in the foreground"]
    fn browser_smoke() {
        let choice = native::windows()
            .unwrap()
            .into_iter()
            .find(|choice| choice.title.contains("PresenceKit CU browser fixture"))
            .unwrap();
        let scope = Scope::Window { window: choice.id };
        assert!(native::surface(scope).is_ok(), "fixture must be foreground");
        let executor = Executor::default();
        let session = executor.open(scope, 60, None).unwrap();
        let run = |seq, frame, action| {
            let started = Instant::now();
            let receipt = executor.step(
                Step {
                    device_id: session.device_id.clone().unwrap(),
                    session_id: session.session_id.clone().unwrap(),
                    task_id: "browser-smoke".into(),
                    seq,
                    frame,
                    action,
                },
                None,
                started + Duration::from_secs(20),
            );
            assert!(
                matches!(receipt.status, "ok" | "changed"),
                "{} {:?}",
                receipt.status,
                receipt.reason
            );
            eprintln!(
                "browser step {seq}: {}, {} ms",
                receipt.status,
                started.elapsed().as_millis()
            );
            (receipt.status, receipt.observation.unwrap())
        };
        let (_, before) = run(1, None, Action::Observe {});
        let id = before
            .nodes
            .iter()
            .find(|node| node.name == "CU fixture button")
            .unwrap()
            .id;
        let (status, scrolled) = run(
            2,
            Some(before.version),
            Action::Scroll {
                target: Target::Element { id },
                ticks: -4,
            },
        );
        assert_eq!(status, "changed");
        let id = scrolled
            .nodes
            .iter()
            .find(|node| node.name == "CU fixture button")
            .unwrap()
            .id;
        let (status, clicked) = run(
            3,
            Some(scrolled.version),
            Action::Click {
                target: Target::Element { id },
                button: Button::Left,
            },
        );
        assert_eq!(status, "changed");
        assert!(clicked
            .nodes
            .iter()
            .any(|node| node.name == "CU fixture clicked"));
        executor.stop();
        assert_eq!(executor.status().unwrap().state, "closed");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires the foreground browser fixture and an isolated real backend with cloud vision"]
    fn cloud_browser_chat_smoke() {
        use crate::client_config::ClientConfig;
        use serde_json::{json, Value};

        let config = ClientConfig {
            backend_base: std::env::var("CU05_SMOKE_BACKEND").unwrap(),
            admin_token: std::env::var("CU05_SMOKE_TOKEN").unwrap(),
            ..Default::default()
        };
        let char_id = std::env::var("CU05_SMOKE_CHARACTER").unwrap();
        let backend = reqwest::Url::parse(&config.backend_base).unwrap();
        assert_eq!(backend.host_str(), Some("127.0.0.1"));
        assert_ne!(backend.port(), Some(8080));
        let window = native::windows()
            .unwrap()
            .into_iter()
            .find(|choice| choice.title.contains("PresenceKit CU browser fixture"))
            .unwrap()
            .id;
        let scope = Scope::Window { window };
        assert!(native::surface(scope).is_ok(), "fixture must be foreground");
        let executor = Executor::default();
        let grant = executor.open(scope, 300, Some(true)).unwrap();
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(100))
                .build()
                .unwrap();
            let status = || async {
                crate::authorized_request(
                    &config,
                    client.get(crate::backend_url(&config, "/computer-use/status")),
                )
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .json::<Value>()
                .await
                .unwrap()
            };
            let chat = |message: String| {
                crate::authorized_request(
                    &config,
                    client.post(crate::backend_url(&config, "/desktop/chat")),
                )
                .json(&json!({ "message": message }))
            };
            let exercise = async {
                for _ in 0..40 {
                    if status().await["device_online"] == true {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                let initial = status().await;
                assert_eq!(initial["device_online"], true);
                assert_eq!(initial["transport_mode"], "cloud_proxy");
                assert_eq!(initial["vision_state"], "");
                assert_eq!(executor.control(Control::Pause).unwrap().state, "paused");
                tokio::time::sleep(Duration::from_millis(900)).await;
                assert_eq!(status().await["vision_state"], "paused");
                assert_eq!(executor.control(Control::Resume).unwrap().state, "ready");
                tokio::time::sleep(Duration::from_millis(900)).await;

                let mut previous_task = Value::Null;
                for (goal, expect_cloud) in [
                    ("请使用 computer_use_start 操作当前已授权的测试窗口。点击标准按钮 CU fixture button，点击后它会变成 CU fixture clicked。只操作这个测试按钮。", false),
                    ("请使用 computer_use_start 操作当前已授权的测试窗口。点击右侧白色方框中的蓝色放大镜纯图标（该图标没有 UIA 名称，需 visual target）。点击后出现 CU visual fixture clicked。只操作这个图标。", true),
                ] {
                    let request = chat(goal.into());
                    let chat_job = tauri::async_runtime::spawn(async move {
                        request.send().await.unwrap().error_for_status().unwrap()
                            .json::<Value>().await.unwrap()
                    });
                    let deadline = Instant::now() + Duration::from_secs(100);
                    let result = loop {
                        let state = status().await;
                        if !state["task_id"].is_null() && state["task_id"] != previous_task
                            && state["state"] != "running" && state["state"] != "paused" {
                            break state;
                        }
                        assert!(Instant::now() < deadline, "chat did not complete a new desktop task: {state}");
                        tokio::time::sleep(Duration::from_millis(300)).await;
                    };
                    let _ = chat_job.await.unwrap();
                    eprintln!("cloud={expect_cloud}: {result}");
                    assert_eq!(result["state"], "succeeded");
                    if expect_cloud {
                        assert_eq!(result["last_vision"]["status"], "found");
                    } else {
                        assert!(result["last_vision"].is_null());
                    }
                    previous_task = result["task_id"].clone();
                }
                let _ = chat("请用 computer_use_status 查询刚才桌面任务的真实结果并汇报。".into())
                    .send()
                    .await
                    .unwrap()
                    .error_for_status()
                    .unwrap();
                executor.stop();
            };
            let transport = transport::run(&config, &executor, &grant, &char_id);
            tokio::pin!(transport);
            tokio::select! {
                result = &mut transport => {
                    panic!("desktop transport ended during acceptance: {result:?}");
                }
                _ = exercise => {}
            }
            tokio::time::timeout(Duration::from_secs(3), &mut transport)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(executor.status().unwrap().state, "closed");
            assert_eq!(status().await["device_online"], false);
        });
    }
}

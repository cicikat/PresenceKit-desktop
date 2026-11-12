//! One click-through, capture-excluded status window per physical display.
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::{Cue, Executor};

pub fn start(app: AppHandle, session_id: String, label: String) {
    tauri::async_runtime::spawn(async move {
        let executor = app.state::<Executor>().inner().clone();
        let mut windows: Vec<WebviewWindow> = Vec::new();
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("label", &label)
            .finish();
        let mut previous = None;
        while let Some(cue) = executor.cue(&session_id) {
            if let Some(cue) = cue {
                let mode = match cue {
                    Cue::Active => "active",
                    Cue::Weak => "weak",
                    Cue::Legacy => "legacy",
                };
                if let Ok(monitors) = app.available_monitors() {
                    while windows.len() > monitors.len() {
                        if let Some(window) = windows.pop() {
                            let _ = window.destroy();
                        }
                    }
                    for (index, monitor) in monitors.iter().enumerate() {
                        let new_window = index == windows.len();
                        if new_window {
                            let result = WebviewWindowBuilder::new(
                                &app,
                                format!("computer-use-overlay-{session_id}-{index}"),
                                WebviewUrl::App(
                                    format!("computer-use-overlay.html?{query}&cue={mode}").into(),
                                ),
                            )
                            .transparent(true)
                            .always_on_top(true)
                            .skip_taskbar(true)
                            .focusable(false)
                            .focused(false)
                            .decorations(false)
                            .resizable(false)
                            .shadow(false)
                            .visible(false)
                            .content_protected(true)
                            .build();
                            let Ok(window) = result else { break };
                            if window.set_ignore_cursor_events(true).is_err() {
                                let _ = window.destroy();
                                break;
                            }
                            windows.push(window);
                        }
                        let window = &windows[index];
                        if window.outer_position().ok().as_ref() != Some(monitor.position()) {
                            let _ = window.set_position(*monitor.position());
                        }
                        if window.inner_size().ok().as_ref() != Some(monitor.size()) {
                            let _ = window.set_size(*monitor.size());
                        }
                        if !new_window && previous != Some(cue) {
                            let _ = window.eval(format!("document.documentElement.dataset.cue = '{mode}'"));
                        }
                        if executor.cue(&session_id).flatten().is_some() && !window.is_visible().unwrap_or(false) {
                            let _ = window.show();
                        }
                    }
                }
            } else {
                for window in windows.drain(..) {
                    let _ = window.destroy();
                }
            }
            previous = cue;
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        for window in windows {
            let _ = window.destroy();
        }
    });
}

//! Windows 平台 sensor 实现
//!
//! - WindowsInputSampler: 用 device_query 后台线程轮询键鼠状态,
//!   维护增量计数器
//! - WindowsFocusSampler: 用 windows-rs 调 GetForegroundWindow +
//!   GetWindowTextW + GetWindowThreadProcessId + QueryFullProcessImageName
//!   抓焦点窗口标题和进程名
//!
//! 设计选择:device_query 是轮询式而非 hook 式,优点是不触发杀软
//! 全局 hook 告警,代价是 100Hz 轮询(开销可忽略)。

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use device_query::{DeviceQuery, DeviceState, Keycode, MouseState};

use crate::sensor::focus_window::{FocusSampler, FocusSnapshot};
use crate::sensor::input_hook::{InputCounters, InputSampler};

// ─────────────────────────────────────────────────────────────
// WindowsInputSampler
// ─────────────────────────────────────────────────────────────

/// 共享给后台轮询线程和外部 snapshot 调用的状态
struct SamplerState {
    keystrokes: u32,
    mouse_clicks: u32,
    mouse_distance_px: u64,
    last_activity_at: Instant,
    /// stop 信号
    stop: bool,
}

pub struct WindowsInputSampler {
    state: Arc<Mutex<SamplerState>>,
    thread: Option<JoinHandle<()>>,
}

impl WindowsInputSampler {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(SamplerState {
                keystrokes: 0,
                mouse_clicks: 0,
                mouse_distance_px: 0,
                last_activity_at: Instant::now(),
                stop: false,
            })),
            thread: None,
        }
    }
}

impl Default for WindowsInputSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl InputSampler for WindowsInputSampler {
    fn start(&mut self) -> Result<(), String> {
        if self.thread.is_some() {
            return Err("已经启动".into());
        }
        let state = Arc::clone(&self.state);

        let handle = thread::Builder::new()
            .name("sensor-input-poll".into())
            .spawn(move || {
                let device = DeviceState::new();

                // 上一次轮询时的状态,用于计算增量
                let mut prev_keys: HashSet<Keycode> = HashSet::new();
                let mut prev_mouse_buttons: Vec<bool> = vec![];
                let mut prev_mouse_pos: Option<(i32, i32)> = None;

                // 100Hz 轮询(10ms 间隔),足够捕捉快速按键
                let interval = Duration::from_millis(10);

                loop {
                    // 检查 stop 信号
                    {
                        let st = state.lock().unwrap();
                        if st.stop {
                            break;
                        }
                    }

                    // 读当前键鼠状态
                    let keys: HashSet<Keycode> = device.get_keys().into_iter().collect();
                    let mouse: MouseState = device.get_mouse();

                    let mut keystroke_delta: u32 = 0;
                    let mut click_delta: u32 = 0;
                    let mut distance_delta: u64 = 0;

                    // 键击:计算 "上一帧没按、本帧按下" 的数量(按键 down edge)
                    for k in &keys {
                        if !prev_keys.contains(k) {
                            keystroke_delta += 1;
                        }
                    }

                    // 鼠标点击:对比 button_pressed 状态
                    // device_query 的 mouse.button_pressed 是 Vec<bool>,
                    // index 0 是占位,实际按钮从 index 1 开始(左/右/中等)
                    let cur_buttons = mouse.button_pressed.clone();
                    if cur_buttons.len() == prev_mouse_buttons.len() {
                        for i in 0..cur_buttons.len() {
                            if cur_buttons[i] && !prev_mouse_buttons[i] {
                                click_delta += 1;
                            }
                        }
                    }

                    // 鼠标移动距离
                    if let Some((px, py)) = prev_mouse_pos {
                        let (cx, cy) = mouse.coords;
                        let dx = (cx - px).abs() as u64;
                        let dy = (cy - py).abs() as u64;
                        // 曼哈顿距离近似(够用,不用算欧氏开方)
                        distance_delta = dx + dy;
                    }

                    // 写回累计状态
                    {
                        let mut st = state.lock().unwrap();
                        if keystroke_delta > 0 || click_delta > 0 || distance_delta > 0 {
                            st.last_activity_at = Instant::now();
                        }
                        st.keystrokes = st.keystrokes.saturating_add(keystroke_delta);
                        st.mouse_clicks = st.mouse_clicks.saturating_add(click_delta);
                        st.mouse_distance_px = st.mouse_distance_px.saturating_add(distance_delta);
                    }

                    prev_keys = keys;
                    prev_mouse_buttons = cur_buttons;
                    prev_mouse_pos = Some(mouse.coords);

                    thread::sleep(interval);
                }
            })
            .map_err(|e| format!("无法启动轮询线程: {e}"))?;

        self.thread = Some(handle);
        Ok(())
    }

    fn stop(&mut self) {
        {
            let mut st = self.state.lock().unwrap();
            st.stop = true;
        }
        if let Some(h) = self.thread.take() {
            let _ = h.join();
        }
    }

    fn snapshot_and_reset(&mut self) -> InputCounters {
        let mut st = self.state.lock().unwrap();
        let idle = st.last_activity_at.elapsed().as_secs() as u32;
        let counters = InputCounters {
            keystrokes: st.keystrokes,
            mouse_clicks: st.mouse_clicks,
            mouse_distance_px: st.mouse_distance_px,
            idle_seconds: idle,
        };
        st.keystrokes = 0;
        st.mouse_clicks = 0;
        st.mouse_distance_px = 0;
        // 注意:不重置 last_activity_at,idle_seconds 是"持续无活动时长"
        counters
    }
}

impl Drop for WindowsInputSampler {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─────────────────────────────────────────────────────────────
// WindowsFocusSampler
// ─────────────────────────────────────────────────────────────

pub struct WindowsFocusSampler;

impl WindowsFocusSampler {
    pub fn new() -> Self {
        Self
    }
}

impl Default for WindowsFocusSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl FocusSampler for WindowsFocusSampler {
    fn current(&self) -> FocusSnapshot {
        use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
        use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
        use windows::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        };

        // SAFETY: 所有 Windows API 调用都包在 unsafe 里。
        // 任何失败路径都返回空 FocusSnapshot,不 panic。
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0 == std::ptr::null_mut() {
                return FocusSnapshot::default();
            }

            // ── 抓窗口标题
            let len = GetWindowTextLengthW(hwnd);
            let raw_title = if len > 0 {
                let mut buf: Vec<u16> = vec![0; (len + 1) as usize];
                let n = GetWindowTextW(hwnd, &mut buf);
                if n > 0 {
                    String::from_utf16_lossy(&buf[..n as usize])
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            // ── 抓进程名(从 HWND → PID → 进程句柄 → 模块名)
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return FocusSnapshot {
                    app: String::new(),
                    raw_title,
                };
            }

            let proc_handle = match OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
                false,
                pid,
            ) {
                Ok(h) => h,
                Err(_) => {
                    return FocusSnapshot {
                        app: String::new(),
                        raw_title,
                    };
                }
            };

            let mut name_buf: Vec<u16> = vec![0; MAX_PATH as usize];
            // GetModuleBaseNameW 第二个参数 None 表示主模块(exe 本身)
            let n = GetModuleBaseNameW(proc_handle, None, &mut name_buf);
            let app = if n > 0 {
                String::from_utf16_lossy(&name_buf[..n as usize])
            } else {
                String::new()
            };

            let _ = CloseHandle(proc_handle);

            FocusSnapshot { app, raw_title }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sampler_start_stop_does_not_panic() {
        let mut s = WindowsInputSampler::new();
        let r = s.start();
        // 在 CI / 无桌面环境下可能起不来,允许 Err,但不能 panic
        if r.is_ok() {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let _c = s.snapshot_and_reset();
            s.stop();
        }
    }

    #[test]
    fn focus_sampler_does_not_panic() {
        let s = WindowsFocusSampler::new();
        let _snap = s.current();
        // 无论是否抓到窗口,都不能 panic
    }
}

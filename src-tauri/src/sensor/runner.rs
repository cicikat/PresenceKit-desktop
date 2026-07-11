//! sensor runner:协调采样器、聚合器、发布器的后台任务
//!
//! 架构:
//! - 一个专门的 std::thread 负责"按 tick 间隔 sleep + 发 tick 信号"
//!   (因为 Tauri 没暴露 async sleep,std::thread::sleep 不能放进
//!    async 任务里阻塞 runtime)
//! - 一个 tauri::async_runtime::spawn 出来的 async task 负责接收 tick
//!   信号 → 采样 → 聚合 → 满窗口时 publish(publish 是 async,
//!   所以必须在 async task 里调用,不能在 thread 里直接调)
//! - 一个 AtomicBool 作为 stop 信号,thread 和 async task 都看它

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::async_runtime;

use super::aggregator::Aggregator;
use super::focus_window::create_default_sampler as create_focus_sampler;
use super::input_hook::create_default_sampler as create_input_sampler;
use super::publisher::{Publisher, PublisherConfig};
use super::title_sanitizer::sanitize;

#[derive(Debug, Clone)]
pub struct SensorRunnerConfig {
    pub backend_base_url: String,
    pub admin_token: String,
    pub window_seconds: u32,
    pub tick_seconds: u32,
    pub sensor_version: String,
}

/// runner 句柄,Drop 时自动 stop
pub struct SensorRunnerHandle {
    stop_flag: Arc<AtomicBool>,
    tick_thread: Option<JoinHandle<()>>,
}

impl SensorRunnerHandle {
    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(h) = self.tick_thread.take() {
            // 给 thread 一点时间响应 stop_flag 然后退出 sleep
            let _ = h.join();
        }
    }
}

impl Drop for SensorRunnerHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// 启动 sensor runner
///
/// 启动后会立即返回,采集和发布在后台异步进行。
/// 句柄 Drop 时自动停止 runner 并清理资源。
pub fn spawn_sensor_runner(cfg: SensorRunnerConfig) -> Result<SensorRunnerHandle, String> {
    if cfg.window_seconds == 0 || cfg.tick_seconds == 0 {
        return Err("window_seconds 和 tick_seconds 必须 > 0".into());
    }
    if cfg.tick_seconds > cfg.window_seconds {
        return Err("tick_seconds 不能大于 window_seconds".into());
    }

    let publisher = Publisher::new(PublisherConfig {
        backend_base_url: cfg.backend_base_url.clone(),
        admin_token: cfg.admin_token.clone(),
    })?;

    let mut input = create_input_sampler();
    input.start()?;
    let focus = create_focus_sampler();

    // tick channel:thread 发 tick 信号,async task 收
    let (tick_tx, mut tick_rx) = async_runtime::channel::<()>(8);

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_thread = Arc::clone(&stop_flag);
    let stop_flag_for_async = Arc::clone(&stop_flag);

    // tick thread:用 std::thread::sleep 按间隔发 tick
    let tick_dur = Duration::from_secs(cfg.tick_seconds as u64);
    let tick_thread = thread::Builder::new()
        .name("sensor-runner-tick".into())
        .spawn(move || {
            // 用细粒度 sleep 让 stop 信号能快速响应
            // 整体每 tick_seconds 发一次,但内部每 100ms 检查一次 stop
            let granular = Duration::from_millis(100);
            let mut elapsed_in_tick = Duration::ZERO;
            loop {
                if stop_flag_for_thread.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(granular);
                elapsed_in_tick += granular;
                if elapsed_in_tick >= tick_dur {
                    elapsed_in_tick = Duration::ZERO;
                    // 用 blocking_send 因为我们在 std::thread 里。
                    // 如果 channel 满了(async task 落后),直接丢弃 tick
                    // 而不阻塞,避免 tick thread 卡住影响 stop 响应。
                    if tick_tx.try_send(()).is_err() {
                        // async task 来不及处理,跳过这个 tick
                    }
                }
            }
        })
        .map_err(|e| format!("无法启动 tick thread: {e}"))?;

    // async task:接 tick → 采样 → 聚合 → 发布
    async_runtime::spawn(async move {
        let mut agg = Aggregator::new(cfg.window_seconds, cfg.sensor_version.clone());
        let mut elapsed_in_window: u32 = 0;
        let mut input = input; // move 进 async block
        let focus = focus;
        // 记边沿、不记电平：持续发布成功不重复打印，只在首次成功/从失败恢复时打印一次。
        let mut last_publish_ok: Option<bool> = None;

        eprintln!(
            "[sensor_runner] 启动: window={}s tick={}s backend={} version={}",
            cfg.window_seconds,
            cfg.tick_seconds,
            cfg.backend_base_url,
            cfg.sensor_version
        );

        while let Some(()) = tick_rx.recv().await {
            if stop_flag_for_async.load(Ordering::SeqCst) {
                break;
            }

            // 采样
            let counters = input.snapshot_and_reset();
            let f = focus.current();
            let cleaned = sanitize(&f.app, &f.raw_title);
            agg.ingest_input(counters);
            agg.ingest_focus(&f.app, &cleaned);

            elapsed_in_window = elapsed_in_window.saturating_add(cfg.tick_seconds);
            if elapsed_in_window >= cfg.window_seconds {
                let window = agg.finalize_window();
                elapsed_in_window = 0;
                match publisher.publish(window).await {
                    Ok(()) => {
                        if last_publish_ok != Some(true) {
                            eprintln!("[sensor_runner] 窗口发布成功");
                        }
                        last_publish_ok = Some(true);
                    }
                    Err(e) => {
                        eprintln!("[sensor_runner] 窗口发布失败: {e}");
                        last_publish_ok = Some(false);
                    }
                }
            }
        }

        // 清理
        input.stop();
        eprintln!("[sensor_runner] 已停止");
    });

    Ok(SensorRunnerHandle {
        stop_flag,
        tick_thread: Some(tick_thread),
    })
}

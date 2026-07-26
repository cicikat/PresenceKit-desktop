//! sensor 人工验证 binary
//!
//! 运行:
//!     cargo run --example sensor_probe
//!
//! 行为:启动键鼠 + 焦点窗口采样器,每 5 秒打印一次累计数据,
//! 持续 30 秒后退出。用于本地 smoke 测试,不用于 production。

use std::time::{Duration, Instant};

use tauri_app_lib::sensor::focus_window::create_default_sampler as focus_sampler;
use tauri_app_lib::sensor::input_hook::create_default_sampler as input_sampler;
use tauri_app_lib::sensor::title_sanitizer::sanitize;

fn main() {
    println!("[sensor_probe] starting...");
    let mut input = input_sampler();
    if let Err(e) = input.start() {
        eprintln!("[sensor_probe] input sampler 启动失败: {e}");
        return;
    }
    let focus = focus_sampler();

    let start = Instant::now();
    let total = Duration::from_secs(30);
    let tick = Duration::from_secs(5);

    while start.elapsed() < total {
        std::thread::sleep(tick);

        let counters = input.snapshot_and_reset();
        let f = focus.current();
        let cleaned_title = sanitize(&f.app, &f.raw_title);

        println!(
            "[sensor_probe] t={:?}s  keys={} clicks={} dist_px={} idle_s={}  app={:?} title={:?}",
            start.elapsed().as_secs(),
            counters.keystrokes,
            counters.mouse_clicks,
            counters.mouse_distance_px,
            counters.idle_seconds,
            f.app,
            cleaned_title,
        );
    }

    input.stop();
    println!("[sensor_probe] done");
}

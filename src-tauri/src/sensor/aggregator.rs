//! 30s 窗口聚合器
//!
//! 接收来自 InputSampler 的增量计数和 FocusSampler 的快照,
//! 在窗口结束时产出一个 AggregatedWindow,直接对应
//! POST /sensor/realtime 的请求体结构。

use super::input_hook::InputCounters;

/// 单次 30s 窗口的聚合结果
#[derive(Debug, Clone, Default)]
pub struct AggregatedWindow {
    pub window_seconds: u32,
    pub sensor_version: String,

    pub keystrokes: u32,
    pub mouse_clicks: u32,
    pub mouse_distance_px: u64,
    pub idle_seconds: u32,

    pub focus_app: String,
    pub focus_title_hint: String,
    pub focus_switch_count: u32,
}

pub struct Aggregator {
    window_seconds: u32,
    sensor_version: String,

    // 累计 input
    keystrokes: u32,
    mouse_clicks: u32,
    mouse_distance_px: u64,
    /// 窗口末尾保留最新一次 ingest 时的 idle_seconds
    last_idle_seconds: u32,

    // focus 跟踪
    last_app: String,
    last_title: String,
    switch_count: u32,
    /// 是否已经至少 ingest 过一次 focus(避免首次 ingest 被算作切换)
    has_focus_baseline: bool,
}

impl Aggregator {
    /// 新建聚合器
    ///
    /// `window_seconds`:窗口长度,通常 30。
    /// `sensor_version`:客户端版本号字符串,直接传到 POST body。
    pub fn new(window_seconds: u32, sensor_version: impl Into<String>) -> Self {
        Self {
            window_seconds,
            sensor_version: sensor_version.into(),
            keystrokes: 0,
            mouse_clicks: 0,
            mouse_distance_px: 0,
            last_idle_seconds: 0,
            last_app: String::new(),
            last_title: String::new(),
            switch_count: 0,
            has_focus_baseline: false,
        }
    }

    /// 向聚合器投递一次键鼠 snapshot
    ///
    /// 调用方式:每隔 N 秒(比如 5 秒)调用一次 InputSampler::snapshot_and_reset(),
    /// 然后把结果 ingest 到这里。计数累加,idle_seconds 取最新值
    /// (窗口末尾 idle 应反映"距离窗口结束前最后一次活动"的间隔)。
    pub fn ingest_input(&mut self, counters: InputCounters) {
        self.keystrokes = self.keystrokes.saturating_add(counters.keystrokes);
        self.mouse_clicks = self.mouse_clicks.saturating_add(counters.mouse_clicks);
        self.mouse_distance_px = self.mouse_distance_px.saturating_add(counters.mouse_distance_px);
        self.last_idle_seconds = counters.idle_seconds;
    }

    /// 向聚合器投递一次焦点窗口快照
    ///
    /// 调用方式:每隔 N 秒抓一次焦点,清洗后传入。
    /// switch_count 在 app 字段实际变化时 +1(首次 ingest 不算切换)。
    /// last_app / last_title 始终用最新值覆盖(窗口末尾导出时取最新)。
    pub fn ingest_focus(&mut self, app: &str, title_hint: &str) {
        if self.has_focus_baseline && app != self.last_app {
            self.switch_count = self.switch_count.saturating_add(1);
        }
        self.last_app = app.to_string();
        self.last_title = title_hint.to_string();
        self.has_focus_baseline = true;
    }

    /// 窗口结束时调用,产出 AggregatedWindow 并重置累计状态
    ///
    /// `has_focus_baseline` 也会重置,下次新窗口的第一次 ingest_focus
    /// 不再算作切换。这是预期行为:跨窗口的切换在上一个窗口已经记过,
    /// 新窗口从一个干净的基线开始。
    pub fn finalize_window(&mut self) -> AggregatedWindow {
        let result = AggregatedWindow {
            window_seconds: self.window_seconds,
            sensor_version: self.sensor_version.clone(),
            keystrokes: self.keystrokes,
            mouse_clicks: self.mouse_clicks,
            mouse_distance_px: self.mouse_distance_px,
            idle_seconds: self.last_idle_seconds,
            focus_app: self.last_app.clone(),
            focus_title_hint: self.last_title.clone(),
            focus_switch_count: self.switch_count,
        };
        // 重置累计
        self.keystrokes = 0;
        self.mouse_clicks = 0;
        self.mouse_distance_px = 0;
        self.switch_count = 0;
        self.has_focus_baseline = false;
        // 注意:last_idle_seconds / last_app / last_title 不重置,
        // 它们代表"当前状态",新窗口开始时本来就该接续。
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_counters(k: u32, c: u32, d: u64, idle: u32) -> InputCounters {
        InputCounters {
            keystrokes: k,
            mouse_clicks: c,
            mouse_distance_px: d,
            idle_seconds: idle,
        }
    }

    #[test]
    fn empty_window_yields_zeros() {
        let mut agg = Aggregator::new(30, "1.0.0");
        let w = agg.finalize_window();
        assert_eq!(w.window_seconds, 30);
        assert_eq!(w.sensor_version, "1.0.0");
        assert_eq!(w.keystrokes, 0);
        assert_eq!(w.mouse_clicks, 0);
        assert_eq!(w.mouse_distance_px, 0);
        assert_eq!(w.idle_seconds, 0);
        assert_eq!(w.focus_app, "");
        assert_eq!(w.focus_title_hint, "");
        assert_eq!(w.focus_switch_count, 0);
    }

    #[test]
    fn ingest_input_accumulates() {
        let mut agg = Aggregator::new(30, "1.0.0");
        agg.ingest_input(make_counters(10, 2, 500, 0));
        agg.ingest_input(make_counters(5, 1, 300, 2));
        let w = agg.finalize_window();
        assert_eq!(w.keystrokes, 15);
        assert_eq!(w.mouse_clicks, 3);
        assert_eq!(w.mouse_distance_px, 800);
        // idle 取最新值,不累加
        assert_eq!(w.idle_seconds, 2);
    }

    #[test]
    fn ingest_focus_first_does_not_count_as_switch() {
        let mut agg = Aggregator::new(30, "1.0.0");
        agg.ingest_focus("chrome.exe", "github.com");
        let w = agg.finalize_window();
        assert_eq!(w.focus_app, "chrome.exe");
        assert_eq!(w.focus_title_hint, "github.com");
        assert_eq!(w.focus_switch_count, 0);
    }

    #[test]
    fn ingest_focus_counts_switch_on_app_change() {
        let mut agg = Aggregator::new(30, "1.0.0");
        agg.ingest_focus("chrome.exe", "github.com");
        agg.ingest_focus("Code.exe", "lib.rs");
        agg.ingest_focus("Code.exe", "main.rs"); // 同 app 不算切换
        agg.ingest_focus("chrome.exe", "rust-lang.org"); // 切回 chrome 算切换
        let w = agg.finalize_window();
        assert_eq!(w.focus_app, "chrome.exe");
        assert_eq!(w.focus_title_hint, "rust-lang.org");
        assert_eq!(w.focus_switch_count, 2); // chrome→Code, Code→chrome
    }

    #[test]
    fn finalize_resets_accumulators() {
        let mut agg = Aggregator::new(30, "1.0.0");
        agg.ingest_input(make_counters(10, 2, 500, 3));
        agg.ingest_focus("chrome.exe", "github.com");
        agg.ingest_focus("Code.exe", "lib.rs"); // switch +1
        let _w1 = agg.finalize_window();

        // 第二窗口
        let w2 = agg.finalize_window();
        assert_eq!(w2.keystrokes, 0);
        assert_eq!(w2.mouse_clicks, 0);
        assert_eq!(w2.mouse_distance_px, 0);
        assert_eq!(w2.focus_switch_count, 0);
        // 但 idle_seconds / focus_app / focus_title 保留上窗口最新值
        assert_eq!(w2.idle_seconds, 3);
        assert_eq!(w2.focus_app, "Code.exe");
        assert_eq!(w2.focus_title_hint, "lib.rs");
    }

    #[test]
    fn switch_count_does_not_increment_across_window_boundary() {
        let mut agg = Aggregator::new(30, "1.0.0");
        agg.ingest_focus("chrome.exe", "x");
        let _ = agg.finalize_window();
        // 新窗口第一次 ingest 切到不同 app,不算切换(基线重置)
        agg.ingest_focus("Code.exe", "y");
        let w = agg.finalize_window();
        assert_eq!(w.focus_switch_count, 0);
    }
}

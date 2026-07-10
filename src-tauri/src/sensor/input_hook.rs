//! 键鼠 hook 抽象
//!
//! 本阶段(10)只定义 trait 和 stub。阶段 11 在 platform/windows.rs
//! 用 device_query crate 实现。

/// 一个采样窗口内的键鼠累计计数
#[derive(Debug, Clone, Default)]
pub struct InputCounters {
    pub keystrokes: u32,
    pub mouse_clicks: u32,
    pub mouse_distance_px: u64,
    /// 窗口末尾(最近一次键鼠活动至今)的连续空闲秒数
    pub idle_seconds: u32,
}

/// 键鼠采样器抽象
///
/// 阶段 11 在 platform/windows.rs 提供 Windows 实现。
/// 阶段 13 之后可补 macOS / Linux 实现。
pub trait InputSampler: Send + Sync {
    /// 启动采样(开始 hook 或轮询)
    fn start(&mut self) -> Result<(), String>;

    /// 停止采样(进程退出前清理 hook)
    fn stop(&mut self);

    /// 读取并清零当前累计计数。返回值是上次 snapshot 后到现在的累计。
    fn snapshot_and_reset(&mut self) -> InputCounters;
}

/// stub 实现,所有指标返回 0,用于本阶段编译通过
pub struct StubSampler;

impl InputSampler for StubSampler {
    fn start(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn stop(&mut self) {}

    fn snapshot_and_reset(&mut self) -> InputCounters {
        InputCounters::default()
    }
}

/// Windows 平台的默认 InputSampler 实现
// 需真实环境,见手工测试:WindowsInputSampler 靠 device_query 轮询真实键鼠
// 状态、维护后台线程,行为已在 platform/windows.rs 的
// sampler_start_stop_does_not_panic 里做"不 panic"级别验证,不在这里补更细的单测。
#[cfg(target_os = "windows")]
pub fn create_default_sampler() -> Box<dyn InputSampler> {
    Box::new(crate::sensor::platform::windows::WindowsInputSampler::new())
}

/// 非 Windows 平台暂时返回 stub
#[cfg(not(target_os = "windows"))]
pub fn create_default_sampler() -> Box<dyn InputSampler> {
    eprintln!("[sensor] 非 Windows 平台：input sampler 为 stub，键鼠计数恒为 0，不代表真实输入");
    Box::new(StubSampler)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_sampler_returns_zeros() {
        let mut s = StubSampler;
        assert!(s.start().is_ok());
        let c = s.snapshot_and_reset();
        assert_eq!(c.keystrokes, 0);
        assert_eq!(c.mouse_clicks, 0);
        assert_eq!(c.mouse_distance_px, 0);
        assert_eq!(c.idle_seconds, 0);
        s.stop();
    }

    /// 边界:空活动窗口 —— `InputCounters::default()` 是 runner 在没有真实
    /// 采样器数据时的兜底值,四个字段都必须是 0,不能缺省成别的哨兵值。
    #[test]
    fn input_counters_default_is_all_zero() {
        let c = InputCounters::default();
        assert_eq!(c.keystrokes, 0);
        assert_eq!(c.mouse_clicks, 0);
        assert_eq!(c.mouse_distance_px, 0);
        assert_eq!(c.idle_seconds, 0);
    }

    /// 边界:重复事件 —— runner 的 stop/重连路径可能对同一个采样器重复调用
    /// start(),stub 实现没有"已启动"守卫(不像 WindowsInputSampler 会返回
    /// Err),重复调用必须仍然 Ok,不能 panic。
    #[test]
    fn stub_sampler_double_start_is_ok() {
        let mut s = StubSampler;
        assert!(s.start().is_ok());
        assert!(s.start().is_ok());
        s.stop();
    }

    /// 边界:快速连续读取 —— runner 每个 tick 都调用一次
    /// snapshot_and_reset(),连续多次调用(模拟高频 tick)必须每次都拿到
    /// 干净的零值,不会因为"重置"逻辑缺失而累积残留计数。
    #[test]
    fn stub_sampler_snapshot_and_reset_is_idempotent_across_calls() {
        let mut s = StubSampler;
        for _ in 0..5 {
            let c = s.snapshot_and_reset();
            assert_eq!(c.keystrokes, 0);
            assert_eq!(c.mouse_clicks, 0);
            assert_eq!(c.mouse_distance_px, 0);
            assert_eq!(c.idle_seconds, 0);
        }
    }

    #[test]
    fn stub_sampler_stop_after_multiple_starts_does_not_panic() {
        let mut s = StubSampler;
        s.start().unwrap();
        s.start().unwrap();
        s.stop();
    }
}

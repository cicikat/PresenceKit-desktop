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
#[cfg(target_os = "windows")]
pub fn create_default_sampler() -> Box<dyn InputSampler> {
    Box::new(crate::sensor::platform::windows::WindowsInputSampler::new())
}

/// 非 Windows 平台暂时返回 stub
#[cfg(not(target_os = "windows"))]
pub fn create_default_sampler() -> Box<dyn InputSampler> {
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
}

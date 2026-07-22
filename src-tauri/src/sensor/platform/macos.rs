//! macOS sensor 降级实现。
//!
//! 真实实现需要用户授予 Accessibility 权限，并使用 CGEventTap / WindowServer API。
//! 该能力尚未实现，因此不能悄悄发布全零 sensor 数据：input sampler 在 runner
//! 启动时返回稳定的“不支持”错误，调用方记录后继续运行桌面客户端。

use crate::sensor::focus_window::{FocusSampler, FocusSnapshot};
use crate::sensor::input_hook::{InputCounters, InputSampler};

const SENSOR_UNSUPPORTED: &str = "sensor_not_supported_on_macos";

/// 与 WindowsInputSampler 同职责的 macOS 占位实现。
pub struct MacosInputSampler;

impl MacosInputSampler {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacosInputSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl InputSampler for MacosInputSampler {
    fn start(&mut self) -> Result<(), String> {
        Err(SENSOR_UNSUPPORTED.into())
    }

    fn stop(&mut self) {}

    fn snapshot_and_reset(&mut self) -> InputCounters {
        InputCounters::default()
    }
}

/// 与 WindowsFocusSampler 同职责的 macOS 占位实现。
pub struct MacosFocusSampler;

impl MacosFocusSampler {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacosFocusSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl FocusSampler for MacosFocusSampler {
    fn current(&self) -> FocusSnapshot {
        FocusSnapshot::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_sampler_refuses_to_start_without_accessibility_implementation() {
        let mut sampler = MacosInputSampler::new();
        assert_eq!(sampler.start(), Err(SENSOR_UNSUPPORTED.into()));
    }

    #[test]
    fn focus_sampler_returns_an_empty_snapshot() {
        let sampler = MacosFocusSampler::new();
        let snapshot = sampler.current();
        assert!(snapshot.app.is_empty());
        assert!(snapshot.raw_title.is_empty());
    }
}

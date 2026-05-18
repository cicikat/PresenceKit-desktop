//! 焦点窗口抓取抽象
//!
//! 本阶段(10)只定义 trait 和 stub。阶段 11 在 platform/windows.rs
//! 用 windows-rs crate 调 GetForegroundWindow / GetWindowTextW 实现。

/// 当前焦点窗口快照
#[derive(Debug, Clone, Default)]
pub struct FocusSnapshot {
    /// 进程名,例如 "Code.exe"。无法获取时空字符串
    pub app: String,
    /// 原始窗口标题(未清洗)。调用方必须用 title_sanitizer 清洗后再传出本模块
    pub raw_title: String,
}

/// 焦点窗口采样器抽象
pub trait FocusSampler: Send + Sync {
    /// 抓取当前焦点窗口快照。失败返回默认空快照,不 panic
    fn current(&self) -> FocusSnapshot;
}

/// stub 实现,返回空快照
pub struct StubFocusSampler;

impl FocusSampler for StubFocusSampler {
    fn current(&self) -> FocusSnapshot {
        FocusSnapshot::default()
    }
}

/// Windows 平台的默认 FocusSampler 实现
#[cfg(target_os = "windows")]
pub fn create_default_sampler() -> Box<dyn FocusSampler> {
    Box::new(crate::sensor::platform::windows::WindowsFocusSampler::new())
}

/// 非 Windows 平台暂时返回 stub
#[cfg(not(target_os = "windows"))]
pub fn create_default_sampler() -> Box<dyn FocusSampler> {
    Box::new(StubFocusSampler)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_focus_returns_empty() {
        let s = StubFocusSampler;
        let snap = s.current();
        assert_eq!(snap.app, "");
        assert_eq!(snap.raw_title, "");
    }
}

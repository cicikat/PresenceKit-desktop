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
// 需真实环境,见手工测试:WindowsFocusSampler 调真实 GetForegroundWindow 等
// Win32 API,行为已在 platform/windows.rs 的 focus_sampler_does_not_panic 里
// 做"不 panic"级别验证,不在这里补更细的单测。
#[cfg(target_os = "windows")]
pub fn create_default_sampler() -> Box<dyn FocusSampler> {
    Box::new(crate::sensor::platform::windows::WindowsFocusSampler::new())
}

/// 非 Windows 平台暂时返回 stub
#[cfg(not(target_os = "windows"))]
pub fn create_default_sampler() -> Box<dyn FocusSampler> {
    eprintln!("[sensor] 非 Windows 平台：focus sampler 为 stub，窗口标题/进程名恒为空");
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

    /// 边界:空窗口标题 —— `FocusSnapshot::default()` 是 runner/aggregator
    /// 在"抓不到焦点窗口"时的兜底值,必须两个字段都为空字符串而不是 panic 或缺省别的值。
    #[test]
    fn focus_snapshot_default_has_empty_title_and_app() {
        let snap = FocusSnapshot::default();
        assert_eq!(snap.app, "");
        assert_eq!(snap.raw_title, "");
    }

    #[test]
    fn focus_snapshot_clone_preserves_fields() {
        let snap = FocusSnapshot {
            app: "Code.exe".into(),
            raw_title: "main.rs - VSCode".into(),
        };
        let cloned = snap.clone();
        assert_eq!(cloned.app, snap.app);
        assert_eq!(cloned.raw_title, snap.raw_title);
    }

    /// 边界:重复事件 —— 同一个 stub 采样器被连续快速调用多次(模拟 runner 高频
    /// tick 或焦点快速切换时的重复采样),不应有内部状态导致结果漂移。
    #[test]
    fn stub_focus_repeated_calls_stay_consistent() {
        let s = StubFocusSampler;
        for _ in 0..5 {
            let snap = s.current();
            assert_eq!(snap.app, "");
            assert_eq!(snap.raw_title, "");
        }
    }
}

//! 平台分发模块
//!
//! 本阶段(10)只占位,各平台实现文件为空。
//! 阶段 11 实施 Windows。

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "linux")]
pub mod linux;

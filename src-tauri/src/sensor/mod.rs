//! sensor 模块 - 嵌入式键鼠与焦点窗口感知
//!
//! 设计原则:
//! - 单进程内闭环: Rust 抓取 → Rust 聚合 → Rust POST
//! - 原始数据(键击时序、窗口标题)不离开本模块
//! - title 清洗在 title_sanitizer 内完成,只输出清洗后字符串

pub mod aggregator;
pub mod focus_window;
pub mod input_hook;
pub mod platform;
pub mod publisher;
pub mod runner;
pub mod title_sanitizer;

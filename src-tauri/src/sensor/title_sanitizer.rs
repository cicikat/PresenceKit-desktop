//! title_hint 清洗规则
//!
//! 后端协议(docs/backend-integration.md)约定:
//! - 浏览器:只保留域名(github.com,不保留完整 URL)
//! - 编辑器:只保留文件名(ChatPanel.tsx,不保留完整路径)
//! - 聊天软件:直接置空字符串
//! - 未知/其他应用:直接置空字符串
//! - 黑名单关键词(密码、银行、医疗等)整条置空
//! - 最大长度 80 字符(服务端兜底再截一次)

/// 应用类别,决定如何清洗 title
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppCategory {
    /// 浏览器 - 只保留域名
    Browser,
    /// 编辑器/IDE - 只保留文件名
    Editor,
    /// 聊天/通讯 - 直接置空
    Chat,
    /// 其他/未知 - 直接置空
    Other,
}

/// 黑名单关键词,任何 title 命中都置空
const BLACKLIST_KEYWORDS: &[&str] = &[
    "密码", "password", "passwd",
    "银行", "bank", "支付", "payment",
    "医疗", "病历", "medical",
    "私聊", "private",
];

/// 最大 title 长度
const MAX_TITLE_LEN: usize = 80;

// ─────────────────────────────────────────────────────────────
// 维护指南:扩充进程名词表
// ─────────────────────────────────────────────────────────────
//
// 何时扩充:发现某个应用的窗口标题在 sensor_probe / 实际运行中
// 没被正确清洗(比如聊天软件的窗口标题原样透出)。
//
// 怎么扩充:在下面 `classify_app` 函数的 match 分支里添加进程名
// (全部小写,带 .exe 后缀)。三类的归属:
//
// - Browser:浏览器 → 只保留域名
// - Editor:IDE / 文本编辑器 → 只保留文件名
// - Chat:聊天/通讯/AI 助手 → title 直接置空
//
// 注意大陆软件常见命名(本次未纳入,见 known-issues.md 那条 P2):
// 钉钉、企业微信、网易邮箱、Bilibili 桌面端、各种 IM 桌面版,
// 以及 Claude / ChatGPT 等 AI 聊天桌面客户端,默认都应归 Chat。
//
// Other 是保守默认类别,不会返回原始 title。只有明确归入 Browser 或
// Editor 的进程才允许返回经过清洗的 title_hint。
//
// 黑名单关键词(BLACKLIST_KEYWORDS)是无差别匹配,任何 title
// 命中直接置空,不需要按 app 分类。

/// 根据进程名(全部小写)推断应用类别
///
/// 本表是粗粒度初稿,跟 Emerald-presence core/scheduler/sensor_events.py 的
/// APP_CATEGORY 设计一致但 schema 不同(后端那张表区分 work/leisure,
/// 这里区分 Browser/Editor/Chat,职责不同)。
///
/// 未列出的进程返回 AppCategory::Other。
pub fn classify_app(app_lower: &str) -> AppCategory {
    match app_lower {
        // 浏览器
        "chrome.exe" | "msedge.exe" | "firefox.exe"
        | "brave.exe" | "opera.exe" | "vivaldi.exe" => AppCategory::Browser,

        // 编辑器/IDE
        "code.exe" | "cursor.exe" | "pycharm64.exe" | "idea64.exe"
        | "clion64.exe" | "rider64.exe" | "webstorm64.exe"
        | "sublime_text.exe" | "notepad++.exe" | "obsidian.exe" => AppCategory::Editor,

        // 聊天/通讯
        "wechat.exe" | "qq.exe" | "qqlite.exe" | "telegram.exe"
        | "discord.exe" | "slack.exe" | "feishu.exe" | "dingtalk.exe" => AppCategory::Chat,

        _ => AppCategory::Other,
    }
}

/// 清洗 title_hint
///
/// 流程:
/// 1. 命中黑名单 → 直接返回空字符串
/// 2. Chat 类别 → 直接返回空字符串
/// 3. Browser → 提取域名
/// 4. Editor → 提取文件名(最后一段路径)
/// 5. Other → 直接返回空字符串
/// 6. 最后 UTF-8 安全截断到 MAX_TITLE_LEN
///
/// 输入 app 和 raw_title 都来自焦点窗口抓取,后者可能含敏感信息。
pub fn sanitize(app: &str, raw_title: &str) -> String {
    // 步骤 1:黑名单
    let title_lower = raw_title.to_lowercase();
    for kw in BLACKLIST_KEYWORDS {
        if title_lower.contains(&kw.to_lowercase()) {
            return String::new();
        }
    }

    // 步骤 2:按类别清洗
    let app_lower = app.to_lowercase();
    let category = classify_app(&app_lower);
    let cleaned = match category {
        AppCategory::Chat => String::new(),
        AppCategory::Browser => extract_domain(raw_title),
        AppCategory::Editor => extract_filename(raw_title),
        AppCategory::Other => String::new(),
    };

    // 步骤 3:UTF-8 安全截断
    truncate_utf8(&cleaned, MAX_TITLE_LEN)
}

/// 从浏览器 title 提取域名
///
/// 浏览器 title 通常形如 "GitHub - facebook/react - Chrome",域名信息
/// 不一定直接出现。策略:
/// 1. 找 URL 形态(http:// / https:// 开头)→ 提取 host
/// 2. 否则,寻找形如 "xxx.com" / "xxx.org" 等 TLD 模式
/// 3. 都找不到 → 返回空字符串(宁缺毋滥)
fn extract_domain(title: &str) -> String {
    // 策略 1:URL 形态
    for token in title.split_whitespace() {
        if token.starts_with("http://") || token.starts_with("https://") {
            // 取 host 部分:http(s)://HOST/path
            if let Some(rest) = token.split("://").nth(1) {
                if let Some(host) = rest.split('/').next() {
                    if !host.is_empty() {
                        return host.to_string();
                    }
                }
            }
        }
    }

    // 策略 2:TLD 模式 - 找连续含 "." 的 token
    const COMMON_TLDS: &[&str] = &[".com", ".org", ".net", ".io", ".cn", ".dev"];
    for token in title.split(|c: char| c.is_whitespace() || c == '-' || c == '|') {
        let t = token.trim();
        for tld in COMMON_TLDS {
            if t.ends_with(tld) && t.len() > tld.len() {
                return t.to_string();
            }
        }
    }

    // 都找不到
    String::new()
}

/// 从编辑器 title 提取文件名
///
/// 编辑器 title 通常形如 "ChatPanel.tsx - Emerald-client - Visual Studio Code"
/// 或 "main.rs — src — Emerald-presence"。策略:
/// 1. 按分隔符 (" - " / " — " / " | ") 切分,取第一段
/// 2. 第一段如果是路径形态(含 / 或 \),取最后一段
/// 3. trim 空白
fn extract_filename(title: &str) -> String {
    let separators = [" - ", " — ", " | "];
    let mut first_segment = title.to_string();
    for sep in &separators {
        if let Some(idx) = first_segment.find(sep) {
            first_segment = first_segment[..idx].to_string();
            break;
        }
    }

    // 如果是路径形态,取最后一段
    let basename = first_segment
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(&first_segment);

    basename.trim().to_string()
}

/// UTF-8 安全截断字符串到 max_bytes
///
/// 标准 [..n] slicing 会在 UTF-8 多字节边界 panic,本函数找到
/// 不超过 max_bytes 的最大合法边界。
fn truncate_utf8(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

// ─────────────────────────────────────────────────────────────
// 单元测试
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_browser() {
        assert_eq!(classify_app("chrome.exe"), AppCategory::Browser);
        assert_eq!(classify_app("msedge.exe"), AppCategory::Browser);
    }

    #[test]
    fn classify_editor() {
        assert_eq!(classify_app("code.exe"), AppCategory::Editor);
        assert_eq!(classify_app("cursor.exe"), AppCategory::Editor);
    }

    #[test]
    fn classify_chat() {
        assert_eq!(classify_app("wechat.exe"), AppCategory::Chat);
        assert_eq!(classify_app("qq.exe"), AppCategory::Chat);
    }

    #[test]
    fn classify_other_unknown() {
        assert_eq!(classify_app("unknown.exe"), AppCategory::Other);
        assert_eq!(classify_app("explorer.exe"), AppCategory::Other);
    }

    #[test]
    fn sanitize_blacklist_returns_empty() {
        assert_eq!(sanitize("Code.exe", "处理密码字段 - main.rs - VSCode"), "");
        assert_eq!(sanitize("chrome.exe", "Online Banking - Chase"), "");
        assert_eq!(sanitize("chrome.exe", "病历查询系统"), "");
    }

    #[test]
    fn sanitize_chat_returns_empty() {
        assert_eq!(sanitize("WeChat.exe", "和某人的聊天 - 微信"), "");
        assert_eq!(sanitize("qq.exe", "随便什么标题"), "");
    }

    #[test]
    fn sanitize_browser_extracts_domain_from_url() {
        let s = sanitize("chrome.exe", "Test https://github.com/foo/bar Page");
        assert_eq!(s, "github.com");
    }

    #[test]
    fn sanitize_browser_extracts_domain_from_tld_pattern() {
        let s = sanitize("chrome.exe", "Some Article - example.com - Chrome");
        assert_eq!(s, "example.com");
    }

    #[test]
    fn sanitize_browser_no_domain_returns_empty() {
        let s = sanitize("chrome.exe", "Just some random tab title");
        assert_eq!(s, "");
    }

    #[test]
    fn sanitize_editor_extracts_filename() {
        let s = sanitize("Code.exe", "ChatPanel.tsx - Emerald-client - Visual Studio Code");
        assert_eq!(s, "ChatPanel.tsx");
    }

    #[test]
    fn sanitize_editor_extracts_filename_from_path() {
        let s = sanitize("Code.exe", "/src/main.rs - workspace - VSCode");
        assert_eq!(s, "main.rs");
    }

    #[test]
    fn sanitize_editor_handles_em_dash_separator() {
        let s = sanitize("Code.exe", "lib.rs — src — qq-st-bot");
        assert_eq!(s, "lib.rs");
    }

    #[test]
    fn sanitize_unknown_app_does_not_leak_title() {
        assert_eq!(
            sanitize("unknown.exe", r"C:\Users\alice\Documents\private-plan.docx"),
            ""
        );
    }

    #[test]
    fn sanitize_file_viewers_and_archivers_do_not_leak_filenames() {
        for (app, title) in [
            ("explorer.exe", r"private-folder - File Explorer"),
            ("winword.exe", "quarterly-results.docx - Word"),
            ("acrord32.exe", "medical-record.pdf - Adobe Acrobat Reader"),
            ("7zfm.exe", "backup-secrets.zip"),
        ] {
            assert_eq!(sanitize(app, title), "", "{app} leaked its window title");
        }
    }

    #[test]
    fn sanitize_truncates_to_80_bytes() {
        let long = "a".repeat(200);
        let s = sanitize("code.exe", &long);
        assert!(s.len() <= 80);
        assert_eq!(s.len(), 80);
    }

    #[test]
    fn sanitize_truncate_utf8_safe() {
        // 中文 3 字节,放到 80 字节边界附近确认不 panic
        let s = "测试".repeat(30); // 60 字符 × 3 字节 = 180 字节
        let out = sanitize("code.exe", &s);
        assert!(out.len() <= 80);
        // 截断后必须仍是合法 UTF-8(能 to_string 不 panic)
        let _ = out.to_string();
    }

    #[test]
    fn sanitize_empty_input() {
        assert_eq!(sanitize("", ""), "");
        assert_eq!(sanitize("chrome.exe", ""), "");
    }

    #[test]
    fn truncate_utf8_does_not_split_char() {
        let s = "你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界";
        let out = truncate_utf8(s, 80);
        // 不能 panic,长度 <= 80,且必须是合法 UTF-8
        assert!(out.len() <= 80);
        assert!(out.is_char_boundary(out.len()));
    }
}

//! POST /sensor/realtime 发布器
//!
//! 用 reqwest 把 AggregatedWindow 转成 JSON 推到后端。
//! HTTP client 必须 .no_proxy() 避免系统代理干扰本机请求。

use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use super::aggregator::AggregatedWindow;

#[derive(Debug, Clone)]
pub struct PublisherConfig {
    pub backend_base_url: String,
    pub admin_token: String,
}

pub struct Publisher {
    client: reqwest::Client,
    cfg: PublisherConfig,
}

impl Publisher {
    pub fn new(cfg: PublisherConfig) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("无法创建 HTTP client: {e}"))?;
        Ok(Self { client, cfg })
    }

    /// 发送一个聚合窗口到后端 /sensor/realtime
    ///
    /// 后端协议(`docs/backend-integration.md`):
    /// {
    ///   "window_seconds": int,
    ///   "ts": float (unix 秒),
    ///   "sensor_version": str,
    ///   "input": { keystrokes, mouse_clicks, mouse_distance_px, idle_seconds },
    ///   "focus": { app, title_hint, switch_count }
    /// }
    pub async fn publish(&self, window: AggregatedWindow) -> Result<(), String> {
        let url = format!("{}/sensor/realtime", self.cfg.backend_base_url);
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);

        let body = json!({
            "window_seconds": window.window_seconds,
            "ts": ts,
            "sensor_version": window.sensor_version,
            "input": {
                "keystrokes": window.keystrokes,
                "mouse_clicks": window.mouse_clicks,
                "mouse_distance_px": window.mouse_distance_px,
                "idle_seconds": window.idle_seconds,
            },
            "focus": {
                "app": window.focus_app,
                "title_hint": window.focus_title_hint,
                "switch_count": window.focus_switch_count,
            }
        });

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.cfg.admin_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("POST 失败: {e}"))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("后端返回 {}: {}", status, text));
        }

        Ok(())
    }
}

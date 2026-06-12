use crate::client_config::load_client_config;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    http::{header::AUTHORIZATION, HeaderValue},
    Message,
};

const AUTH_ERROR: &str = "AUTHENTICATION_FAILED: 认证失败，请检查本地 token 配置";
// Backend close-frame protocol contract. Until the backend defines a dedicated
// close code, only this exact normal-close tuple means "do not reconnect".
const REPLACED_BY_NEW_CONNECTION_CODE: u16 = 1000;
const REPLACED_BY_NEW_CONNECTION_REASON: &str = "replaced by new connection";

pub struct WsBridgeState {
    next_connection_id: AtomicU64,
    active: Mutex<Option<(u64, UnboundedSender<Message>)>>,
}

impl Default for WsBridgeState {
    fn default() -> Self {
        Self {
            next_connection_id: AtomicU64::new(1),
            active: Mutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsMessageEvent {
    connection_id: u64,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsCloseEvent {
    connection_id: u64,
    code: u16,
    replaced_by_new_connection: bool,
}

pub fn sanitize_websocket_url(raw: &str) -> Result<String, String> {
    let mut url = url::Url::parse(raw).map_err(|_| "WebSocket 配置地址无效".to_string())?;
    if !matches!(url.scheme(), "ws" | "wss") {
        return Err("WebSocket 配置地址无效".to_string());
    }

    let retained: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| key != "token")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    url.set_query(None);
    if !retained.is_empty() {
        url.query_pairs_mut().extend_pairs(retained);
    }
    Ok(url.into())
}

fn build_authorized_request(
    url: &str,
    token: &str,
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, String> {
    let mut request = url
        .into_client_request()
        .map_err(|_| "WebSocket 配置地址无效".to_string())?;
    let mut value = HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| "本地 token 配置无效".to_string())?;
    value.set_sensitive(true);
    request.headers_mut().insert(AUTHORIZATION, value);
    Ok(request)
}

fn connection_error(error: tokio_tungstenite::tungstenite::Error) -> String {
    match error {
        tokio_tungstenite::tungstenite::Error::Http(response)
            if matches!(response.status().as_u16(), 401 | 403) =>
        {
            AUTH_ERROR.to_string()
        }
        _ => "WebSocket 连接失败".to_string(),
    }
}

fn is_replaced_by_new_connection(code: u16, reason: &str) -> bool {
    code == REPLACED_BY_NEW_CONNECTION_CODE && reason == REPLACED_BY_NEW_CONNECTION_REASON
}

#[tauri::command]
pub async fn native_ws_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, WsBridgeState>,
) -> Result<u64, String> {
    let cfg = load_client_config(&app);
    let url = sanitize_websocket_url(&cfg.websocket_base)?;
    let request = build_authorized_request(&url, &cfg.admin_token)?;
    let (stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(connection_error)?;
    let (mut writer, mut reader) = stream.split();
    let (sender, mut receiver) = unbounded_channel::<Message>();
    let connection_id = state.next_connection_id.fetch_add(1, Ordering::Relaxed);

    if let Some((_, old_sender)) = state
        .active
        .lock()
        .map_err(|_| "WebSocket 状态不可用".to_string())?
        .replace((connection_id, sender))
    {
        let _ = old_sender.send(Message::Close(None));
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                outgoing = receiver.recv() => {
                    match outgoing {
                        Some(message) => {
                            if writer.send(message).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                incoming = reader.next() => {
                    match incoming {
                        Some(Ok(Message::Text(text))) => {
                            let _ = app_handle.emit("client-ws-message", WsMessageEvent {
                                connection_id,
                                data: text.to_string(),
                            });
                        }
                        Some(Ok(Message::Close(frame))) => {
                            let code = frame
                                .as_ref()
                                .map(|value| value.code.into())
                                .unwrap_or(1000);
                            let replaced = frame
                                .as_ref()
                                .map(|value| {
                                    is_replaced_by_new_connection(code, value.reason.as_ref())
                                })
                                .unwrap_or(false);
                            let _ = app_handle.emit("client-ws-close", WsCloseEvent {
                                connection_id,
                                code,
                                replaced_by_new_connection: replaced,
                            });
                            return;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(_)) | None => break,
                    }
                }
            }
        }

        let _ = app_handle.emit("client-ws-close", WsCloseEvent {
            connection_id,
            code: 1006,
            replaced_by_new_connection: false,
        });
    });

    Ok(connection_id)
}

#[tauri::command]
pub fn native_ws_send(
    state: tauri::State<'_, WsBridgeState>,
    connection_id: u64,
    message: String,
) -> Result<(), String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "WebSocket 状态不可用".to_string())?;
    let Some((active_id, sender)) = active.as_ref() else {
        return Err("WebSocket 未连接".to_string());
    };
    if *active_id != connection_id {
        return Err("WebSocket 连接已更新".to_string());
    }
    sender
        .send(Message::Text(message.into()))
        .map_err(|_| "WebSocket 未连接".to_string())
}

#[tauri::command]
pub fn native_ws_disconnect(state: tauri::State<'_, WsBridgeState>) -> Result<(), String> {
    if let Some((_, sender)) = state
        .active
        .lock()
        .map_err(|_| "WebSocket 状态不可用".to_string())?
        .take()
    {
        let _ = sender.send(Message::Close(None));
    }
    Ok(())
}

pub fn register<R: tauri::Runtime>(app: &mut tauri::App<R>) {
    app.manage(WsBridgeState::default());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_url_removes_token_query_and_preserves_other_params() {
        let sanitized = sanitize_websocket_url(
            "ws://127.0.0.1:8080/ws/desktop?token=secret-value&client=emerald",
        )
        .unwrap();
        assert_eq!(
            sanitized,
            "ws://127.0.0.1:8080/ws/desktop?client=emerald"
        );
        assert!(!sanitized.contains("token="));
        assert!(!sanitized.contains("secret-value"));
    }

    #[test]
    fn websocket_request_uses_sensitive_bearer_header() {
        let request =
            build_authorized_request("ws://127.0.0.1:8080/ws/desktop", "secret-value").unwrap();
        let authorization = request.headers().get(AUTHORIZATION).unwrap();
        assert_eq!(authorization, "Bearer secret-value");
        assert!(authorization.is_sensitive());
        assert!(!request.uri().to_string().contains("secret-value"));
    }

    #[test]
    fn authentication_error_is_safe() {
        assert!(AUTH_ERROR.contains("认证失败"));
        assert!(!AUTH_ERROR.contains("Bearer"));
        assert!(!AUTH_ERROR.contains("secret-value"));
    }

    #[test]
    fn exact_normal_close_reason_marks_connection_as_replaced() {
        assert!(is_replaced_by_new_connection(
            REPLACED_BY_NEW_CONNECTION_CODE,
            REPLACED_BY_NEW_CONNECTION_REASON
        ));
    }

    #[test]
    fn similar_reason_or_non_normal_code_does_not_mark_connection_as_replaced() {
        assert!(!is_replaced_by_new_connection(
            REPLACED_BY_NEW_CONNECTION_CODE,
            "client replaced by new connection"
        ));
        assert!(!is_replaced_by_new_connection(
            1006,
            REPLACED_BY_NEW_CONNECTION_REASON
        ));
        assert!(!is_replaced_by_new_connection(
            REPLACED_BY_NEW_CONNECTION_CODE,
            ""
        ));
    }
}

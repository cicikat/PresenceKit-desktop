//! Local-only browser bridge for the admin panel.

use crate::client_config::load_client_config;
use futures_util::StreamExt;
use getrandom::fill as fill_random;
use reqwest::header::{HeaderName, HeaderValue};
use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};

const CAPABILITY_PREFIX: &str = "/__presencekit_admin/";
const IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBridgeStatus {
    pub active: bool,
    pub port: Option<u16>,
    pub backend_base: Option<String>,
    pub idle_timeout_seconds: u64,
}

struct BridgeHandle {
    port: u16,
    backend_base: String,
    capability: String,
    stop: Option<oneshot::Sender<()>>,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct AdminBridgeState {
    active: Mutex<Option<BridgeHandle>>,
}

struct RequestHead {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    content_length: usize,
    initial_body: Vec<u8>,
}

fn inactive() -> AdminBridgeStatus {
    AdminBridgeStatus { active: false, port: None, backend_base: None, idle_timeout_seconds: IDLE_TIMEOUT.as_secs() }
}

pub fn status(state: &AdminBridgeState) -> AdminBridgeStatus {
    let Ok(guard) = state.active.lock() else { return inactive(); };
    let Some(handle) = guard.as_ref() else { return inactive(); };
    if !handle.alive.load(Ordering::Acquire) { return inactive(); }
    AdminBridgeStatus {
        active: true,
        port: Some(handle.port),
        backend_base: Some(handle.backend_base.clone()),
        idle_timeout_seconds: IDLE_TIMEOUT.as_secs(),
    }
}

pub fn stop_bridge(state: &AdminBridgeState) {
    if let Ok(mut guard) = state.active.lock() {
        if let Some(mut handle) = guard.take() {
            handle.alive.store(false, Ordering::Release);
            if let Some(stop) = handle.stop.take() { let _ = stop.send(()); }
        }
    }
}

#[tauri::command]
pub async fn open_admin_panel(app: AppHandle, state: State<'_, AdminBridgeState>) -> Result<AdminBridgeStatus, String> {
    let backend = validate_backend_base(&load_client_config(&app).backend_base)?;
    let existing = {
        let guard = state.active.lock().map_err(|_| "管理面板 bridge 状态不可用".to_string())?;
        guard.as_ref().and_then(|h| {
            (h.alive.load(Ordering::Acquire) && h.backend_base == backend)
                .then(|| (h.port, h.capability.clone()))
        })
    };
    if let Some((port, capability)) = existing {
        app.opener().open_url(bridge_url(port, &capability), None::<&str>).map_err(|e| format!("无法打开管理面板：{e}"))?;
        return Ok(status(&state));
    }
    {
        let mut guard = state.active.lock().map_err(|_| "管理面板 bridge 状态不可用".to_string())?;
        if let Some(mut old) = guard.take() {
            old.alive.store(false, Ordering::Release);
            if let Some(stop) = old.stop.take() { let _ = stop.send(()); }
        }
    }
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| format!("无法启动本地管理面板 bridge：{e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let capability = new_capability()?;
    let (stop_tx, stop_rx) = oneshot::channel();
    let alive = Arc::new(AtomicBool::new(true));
    let task_alive = Arc::clone(&alive);
    let client = reqwest::Client::builder().no_proxy().build().map_err(|_| "无法创建管理面板上游连接".to_string())?;
    let task_capability = capability.clone();
    let task_backend = backend.clone();
    tauri::async_runtime::spawn(async move { run_bridge(listener, task_backend, task_capability, client, stop_rx, task_alive).await; });
    state.active.lock().map_err(|_| "管理面板 bridge 状态不可用".to_string())?.replace(BridgeHandle { port, backend_base: backend, capability: capability.clone(), stop: Some(stop_tx), alive });
    app.opener().open_url(bridge_url(port, &capability), None::<&str>).map_err(|e| format!("无法打开管理面板：{e}"))?;
    Ok(status(&state))
}

#[tauri::command]
pub fn admin_bridge_status(state: State<'_, AdminBridgeState>) -> AdminBridgeStatus { status(&state) }

#[tauri::command]
pub fn stop_admin_bridge(state: State<'_, AdminBridgeState>) -> AdminBridgeStatus { stop_bridge(&state); inactive() }

fn new_capability() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    fill_random(&mut bytes).map_err(|_| "无法生成管理面板 capability".to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn bridge_url(port: u16, capability: &str) -> String { format!("http://127.0.0.1:{port}{CAPABILITY_PREFIX}{capability}/") }

fn validate_backend_base(raw: &str) -> Result<String, String> {
    let value = raw.trim().trim_end_matches('/');
    let url = url::Url::parse(value).map_err(|_| "后端地址必须是有效的 http/https URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || !matches!(url.path(), "" | "/") {
        return Err("后端地址只允许不含凭据、query 或 fragment 的 http/https origin".to_string());
    }
    Ok(value.to_string())
}

fn upstream_path(target: &str, capability: &str) -> Option<String> {
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let suffix = url.path().strip_prefix(&format!("{CAPABILITY_PREFIX}{capability}"))?;
    if !suffix.is_empty() && !suffix.starts_with('/') { return None; }
    let mut result = if suffix.is_empty() { "/".to_string() } else { suffix.to_string() };
    if let Some(query) = url.query() { result.push('?'); result.push_str(query); }
    Some(result)
}

fn allowed_method(method: &str) -> bool { matches!(method, "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS") }

fn allowed_path(path: &str) -> bool {
    if path == "/" || path == "/openapi.json" { return true; }
    const PREFIXES: &[&str] = &["/static", "/auth", "/settings", "/model-presets", "/proxy", "/tts", "/scheduler", "/observability", "/users", "/characters", "/lorebook", "/jailbreak-entries", "/dream", "/group", "/activity", "/memory", "/chat-log", "/diary", "/garden", "/mood", "/sensor", "/watch", "/integrations", "/upload", "/transcribe", "/hardware", "/system", "/spend", "/phone_control", "/perception", "/debug", "/status", "/health", "/setup"];
    PREFIXES.iter().any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

fn hop_by_hop(name: &str) -> bool { matches!(name.to_ascii_lowercase().as_str(), "connection" | "keep-alive" | "proxy-authenticate" | "proxy-authorization" | "te" | "trailer" | "transfer-encoding" | "upgrade") }

async fn run_bridge(listener: TcpListener, backend: String, capability: String, client: reqwest::Client, mut stop: oneshot::Receiver<()>, alive: Arc<AtomicBool>) {
    loop {
        tokio::select! {
            _ = &mut stop => break,
            _ = tokio::time::sleep(IDLE_TIMEOUT) => break,
            accepted = listener.accept() => {
                let Ok((stream, _)) = accepted else { break; };
                let backend = backend.clone(); let capability = capability.clone(); let client = client.clone();
                tauri::async_runtime::spawn(async move { let _ = handle_connection(stream, &backend, &capability, &client).await; });
            }
        }
    }
    alive.store(false, Ordering::Release);
}

async fn handle_connection(mut stream: TcpStream, backend: &str, capability: &str, client: &reqwest::Client) -> Result<(), String> {
    let request = match read_head(&mut stream).await { Ok(v) => v, Err((code, msg)) => { write_error(&mut stream, code, msg).await?; return Ok(()); } };
    let port = stream.local_addr().map_err(|e| e.to_string())?.port();
    let Some(host) = header(&request.headers, "host") else { write_error(&mut stream, 400, "missing host").await?; return Ok(()); };
    if host != format!("127.0.0.1:{port}") { write_error(&mut stream, 421, "invalid host").await?; return Ok(()); }
    if let Some(origin) = header(&request.headers, "origin") { if origin != format!("http://127.0.0.1:{port}") { write_error(&mut stream, 403, "invalid origin").await?; return Ok(()); } }
    if !allowed_method(&request.method) { write_error(&mut stream, 405, "method not allowed").await?; return Ok(()); }
    let Some(path) = upstream_path(&request.target, capability) else { write_error(&mut stream, 404, "not found").await?; return Ok(()); };
    let path_only = path.split_once('?').map(|(p, _)| p).unwrap_or(&path);
    if !allowed_path(path_only) { write_error(&mut stream, 404, "not found").await?; return Ok(()); }
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "invalid method".to_string())?;
    let mut builder = client.request(method.clone(), format!("{backend}{path}"));
    for (name, value) in &request.headers {
        let lower = name.to_ascii_lowercase();
        if lower == "host" || lower == "content-length" || hop_by_hop(&lower) { continue; }
        builder = builder.header(HeaderName::from_bytes(name.as_bytes()).map_err(|_| "invalid header")?, HeaderValue::from_str(value).map_err(|_| "invalid header")?);
    }
    let (mut reader, mut writer) = stream.into_split();
    let response = if request.content_length == 0 && request.initial_body.is_empty() {
        builder.send().await
    } else {
        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, std::io::Error>>(8);
        let body_stream = futures_util::stream::unfold(rx, |mut rx| async { rx.recv().await.map(|item| (item, rx)) });
        let initial = request.initial_body; let length = request.content_length;
        tauri::async_runtime::spawn(async move { forward_body(&mut reader, initial, length, tx).await; });
        builder.body(reqwest::Body::wrap_stream(body_stream)).send().await
    };
    let response = match response { Ok(v) => v, Err(_) => { write_error(&mut writer, 502, "upstream unavailable").await?; return Ok(()); } };
    write_response(&mut writer, method == reqwest::Method::HEAD, response).await
}

fn header(headers: &[(String, String)], name: &str) -> Option<String> { headers.iter().find_map(|(k, v)| k.eq_ignore_ascii_case(name).then(|| v.clone())) }

async fn read_head(stream: &mut TcpStream) -> Result<RequestHead, (u16, &'static str)> {
    let mut buffer = Vec::new();
    let end = loop {
        let mut chunk = [0u8; 4096]; let count = stream.read(&mut chunk).await.map_err(|_| (400, "bad request"))?;
        if count == 0 { return Err((400, "bad request")); }
        buffer.extend_from_slice(&chunk[..count]);
        if buffer.len() > MAX_HEADER_BYTES { return Err((431, "headers too large")); }
        if let Some(index) = buffer.windows(4).position(|p| p == b"\r\n\r\n") { break index + 4; }
    };
    let mut lines = buffer[..end - 4].split(|b| *b == b'\n');
    let line = lines.next().ok_or((400, "bad request"))?;
    let line = std::str::from_utf8(line.strip_suffix(b"\r").unwrap_or(line)).map_err(|_| (400, "bad request"))?;
    let mut parts = line.split_whitespace(); let method = parts.next().ok_or((400, "bad request"))?; let target = parts.next().ok_or((400, "bad request"))?; let version = parts.next().ok_or((400, "bad request"))?;
    if parts.next().is_some() || version != "HTTP/1.1" || !target.starts_with('/') || target.contains('#') { return Err((400, "bad request")); }
    let mut headers = Vec::new(); let mut content_length = 0usize;
    for raw in lines {
        let raw = raw.strip_suffix(b"\r").ok_or((400, "bad request"))?; if raw.is_empty() { continue; }
        let split = raw.iter().position(|b| *b == b':').ok_or((400, "bad request"))?;
        let name = std::str::from_utf8(&raw[..split]).map_err(|_| (400, "bad request"))?; let value = std::str::from_utf8(&raw[split + 1..]).map_err(|_| (400, "bad request"))?.trim();
        if name.is_empty() || value.contains('\r') || value.contains('\n') { return Err((400, "bad request")); }
        if name.eq_ignore_ascii_case("transfer-encoding") { return Err((501, "chunked requests are not supported")); }
        if name.eq_ignore_ascii_case("content-length") { content_length = value.parse().map_err(|_| (400, "bad request"))?; if content_length > MAX_BODY_BYTES { return Err((413, "request body too large")); } }
        headers.push((name.to_string(), value.to_string()));
    }
    Ok(RequestHead { method: method.to_string(), target: target.to_string(), headers, content_length, initial_body: buffer[end..].iter().copied().take(content_length).collect() })
}

async fn forward_body(reader: &mut tokio::net::tcp::OwnedReadHalf, initial: Vec<u8>, length: usize, sender: mpsc::Sender<Result<Vec<u8>, std::io::Error>>) {
    let sent = initial.len(); if !initial.is_empty() && sender.send(Ok(initial)).await.is_err() { return; }
    let mut remaining = length.saturating_sub(sent); let mut buffer = vec![0u8; 16 * 1024];
    while remaining > 0 { let size = remaining.min(buffer.len()); match reader.read(&mut buffer[..size]).await { Ok(0) => break, Ok(count) => { remaining -= count; if sender.send(Ok(buffer[..count].to_vec())).await.is_err() { break; } }, Err(error) => { let _ = sender.send(Err(error)).await; break; } } }
}

async fn write_error<W: AsyncWrite + Unpin>(stream: &mut W, status: u16, message: &str) -> Result<(), String> {
    let body = format!("{status} {message}\n"); let response = format!("HTTP/1.1 {status} {message}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()); stream.write_all(response.as_bytes()).await.map_err(|e| e.to_string())
}

async fn write_response<W: AsyncWrite + Unpin>(stream: &mut W, head_only: bool, response: reqwest::Response) -> Result<(), String> {
    let status = response.status(); let no_body = head_only || status == reqwest::StatusCode::NO_CONTENT || status == reqwest::StatusCode::NOT_MODIFIED; let has_length = response.headers().contains_key(reqwest::header::CONTENT_LENGTH); let reason = status.canonical_reason().unwrap_or("Response"); let mut head = format!("HTTP/1.1 {} {}\r\n", status.as_u16(), reason);
    for (name, value) in response.headers() { if hop_by_hop(name.as_str()) || (no_body && name == reqwest::header::CONTENT_LENGTH) { continue; } if let Ok(value) = value.to_str() { head.push_str(name.as_str()); head.push_str(": "); head.push_str(value); head.push_str("\r\n"); } }
    if !has_length && !no_body { head.push_str("Transfer-Encoding: chunked\r\n"); } head.push_str("Connection: close\r\n\r\n"); stream.write_all(head.as_bytes()).await.map_err(|e| e.to_string())?; if no_body { return Ok(()); }
    let mut body = response.bytes_stream(); while let Some(chunk) = body.next().await { let chunk = chunk.map_err(|_| "upstream stream failed".to_string())?; if !has_length { stream.write_all(format!("{:X}\r\n", chunk.len()).as_bytes()).await.map_err(|e| e.to_string())?; stream.write_all(&chunk).await.map_err(|e| e.to_string())?; stream.write_all(b"\r\n").await.map_err(|e| e.to_string())?; } else { stream.write_all(&chunk).await.map_err(|e| e.to_string())?; } } if !has_length { stream.write_all(b"0\r\n\r\n").await.map_err(|e| e.to_string())?; } Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn backend_origin_rejects_unsafe_inputs() { assert!(validate_backend_base("https://example.test").is_ok()); assert!(validate_backend_base("https://user@example.test").is_err()); assert!(validate_backend_base("https://example.test?token=x").is_err()); assert!(validate_backend_base("https://example.test/admin").is_err()); }
    #[test] fn capability_is_required_and_query_survives() { assert_eq!(upstream_path("/__presencekit_admin/abc/settings?x=1", "abc"), Some("/settings?x=1".into())); assert_eq!(upstream_path("/settings", "abc"), None); assert_eq!(upstream_path("/__presencekit_admin/abcx/", "abc"), None); }
    #[test] fn methods_and_paths_are_bounded() { assert!(allowed_method("PATCH")); assert!(!allowed_method("CONNECT")); assert!(allowed_path("/settings/relay")); assert!(!allowed_path("/settings-escape")); assert!(!allowed_path("/internal/secret")); }
    #[test] fn hop_by_hop_headers_are_removed() { assert!(hop_by_hop("Connection")); assert!(hop_by_hop("Proxy-Authorization")); assert!(!hop_by_hop("Authorization")); }
}

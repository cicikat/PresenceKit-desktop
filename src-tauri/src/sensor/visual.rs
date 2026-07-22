//! Windows visual-observation producer.
//!
//! The scheduler only samples in memory. A frame is uploaded only after the
//! backend preflight gate, the local opt-in gate, an unlocked-desktop check,
//! and a perceptual-hash change check all succeed.

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageEncoder, RgbImage};
use serde::{Deserialize, Serialize};
use tauri::async_runtime;

const DEFAULT_SAMPLE_INTERVAL_SECONDS: u64 = 5 * 60;
const MIN_SAMPLE_INTERVAL_SECONDS: u64 = 60;
const MAX_SAMPLE_INTERVAL_SECONDS: u64 = 60 * 60;
const MAX_IMAGE_SIDE: u32 = 1280;
const CHANGE_DISTANCE_THRESHOLD: u32 = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualPerceptionConfig {
    pub enabled: bool,
    pub sample_interval_seconds: u64,
}

impl Default for VisualPerceptionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            sample_interval_seconds: DEFAULT_SAMPLE_INTERVAL_SECONDS,
        }
    }
}

impl VisualPerceptionConfig {
    pub fn validated(enabled: bool, sample_interval_seconds: u64) -> Result<Self, String> {
        if !(MIN_SAMPLE_INTERVAL_SECONDS..=MAX_SAMPLE_INTERVAL_SECONDS).contains(&sample_interval_seconds) {
            return Err(format!(
                "视觉观察采样间隔必须在 {}–{} 秒之间",
                MIN_SAMPLE_INTERVAL_SECONDS, MAX_SAMPLE_INTERVAL_SECONDS
            ));
        }
        Ok(Self { enabled, sample_interval_seconds })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualPerceptionStatus {
    pub last_attempt_at: Option<f64>,
    pub last_push_at: Option<f64>,
    pub last_result: String,
    pub failure_count: u32,
}

impl Default for VisualPerceptionStatus {
    fn default() -> Self {
        Self {
            last_attempt_at: None,
            last_push_at: None,
            last_result: "idle".into(),
            failure_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualPerceptionSettings {
    pub enabled: bool,
    pub sample_interval_seconds: u64,
    pub status: VisualPerceptionStatus,
}

pub struct VisualRuntime {
    enabled: AtomicBool,
    sample_interval_seconds: AtomicU64,
    status: Mutex<VisualPerceptionStatus>,
}

impl VisualRuntime {
    pub fn new(config: &VisualPerceptionConfig) -> Self {
        Self {
            enabled: AtomicBool::new(config.enabled),
            sample_interval_seconds: AtomicU64::new(config.sample_interval_seconds),
            status: Mutex::new(VisualPerceptionStatus::default()),
        }
    }

    pub fn apply(&self, config: &VisualPerceptionConfig) {
        self.enabled.store(config.enabled, Ordering::SeqCst);
        self.sample_interval_seconds
            .store(config.sample_interval_seconds, Ordering::SeqCst);
        if !config.enabled {
            self.record("local_disabled", false, false);
        }
    }

    pub fn config(&self) -> VisualPerceptionConfig {
        VisualPerceptionConfig {
            enabled: self.enabled.load(Ordering::SeqCst),
            sample_interval_seconds: self.sample_interval_seconds.load(Ordering::SeqCst),
        }
    }

    pub fn settings(&self) -> VisualPerceptionSettings {
        let config = self.config();
        let status = self.status.lock().map(|status| status.clone()).unwrap_or_default();
        VisualPerceptionSettings {
            enabled: config.enabled,
            sample_interval_seconds: config.sample_interval_seconds,
            status,
        }
    }

    fn record(&self, result: &str, attempted: bool, pushed: bool) {
        if let Ok(mut status) = self.status.lock() {
            let now = unix_timestamp();
            if attempted {
                status.last_attempt_at = Some(now);
            }
            if pushed {
                status.last_push_at = Some(now);
            }
            if result == "failed" {
                status.failure_count = status.failure_count.saturating_add(1);
            }
            status.last_result = result.into();
        }
    }
}

pub struct VisualRunnerConfig {
    pub backend_base_url: String,
    pub admin_token: String,
    pub runtime: Arc<VisualRuntime>,
}

pub struct VisualRunnerHandle {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for VisualRunnerHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub fn spawn_visual_runner(cfg: VisualRunnerConfig) -> Result<VisualRunnerHandle, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| format!("无法创建视觉观察 HTTP client: {error}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let (tick_tx, mut tick_rx) = async_runtime::channel::<()>(1);
    let runtime = Arc::clone(&cfg.runtime);

    let thread = thread::Builder::new()
        .name("visual-observation-sampler".into())
        .spawn(move || {
            let mut elapsed = Duration::ZERO;
            let granularity = Duration::from_millis(250);
            loop {
                if stop_for_thread.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(granularity);
                elapsed += granularity;
                let interval = Duration::from_secs(runtime.sample_interval_seconds.load(Ordering::SeqCst));
                if elapsed >= interval {
                    elapsed = Duration::ZERO;
                    let _ = tick_tx.try_send(());
                }
            }
        })
        .map_err(|error| format!("无法启动视觉观察采样线程: {error}"))?;

    async_runtime::spawn(async move {
        let mut previous_hash: Option<u64> = None;
        while tick_rx.recv().await.is_some() {
            if !cfg.runtime.enabled.load(Ordering::SeqCst) {
                cfg.runtime.record("local_disabled", false, false);
                continue;
            }
            sample_once(&cfg, &client, &mut previous_hash).await;
        }
    });

    Ok(VisualRunnerHandle { stop, thread: Some(thread) })
}

async fn sample_once(
    cfg: &VisualRunnerConfig,
    client: &reqwest::Client,
    previous_hash: &mut Option<u64>,
) {
    // Fail closed before touching the desktop. This is deliberately a separate
    // request from the upload endpoint so a disabled backend never receives an image.
    let preflight = match client
        .get(format!("{}/perception/visual/config", cfg.backend_base_url.trim_end_matches('/')))
        .bearer_auth(&cfg.admin_token)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response.json::<Preflight>().await.ok(),
        _ => None,
    };
    let Some(preflight) = preflight else {
        cfg.runtime.record("failed", true, false);
        return;
    };
    if !preflight.enabled {
        cfg.runtime.record("backend_disabled", true, false);
        return;
    }
    if !cfg.runtime.enabled.load(Ordering::SeqCst) {
        cfg.runtime.record("local_disabled", false, false);
        return;
    }
    if !has_unlocked_desktop() {
        cfg.runtime.record("locked", true, false);
        return;
    }

    let frame = match capture_primary_screen() {
        Ok(frame) => frame,
        Err(_) => {
            cfg.runtime.record("failed", true, false);
            return;
        }
    };
    let hash = perceptual_hash(&frame);
    let changed = previous_hash
        .map(|previous| hamming_distance(previous, hash) > CHANGE_DISTANCE_THRESHOLD)
        .unwrap_or(true);
    *previous_hash = Some(hash);
    if !changed {
        cfg.runtime.record("unchanged", true, false);
        return;
    }

    let jpeg = match encode_jpeg(frame) {
        Ok(bytes) => bytes,
        Err(_) => {
            cfg.runtime.record("failed", true, false);
            return;
        }
    };
    let image_part = match reqwest::multipart::Part::bytes(jpeg)
        .file_name("screen.jpg")
        .mime_str("image/jpeg")
    {
        Ok(part) => part,
        Err(_) => {
            cfg.runtime.record("failed", true, false);
            return;
        }
    };
    let form = reqwest::multipart::Form::new()
        .part("image", image_part)
        .text("source", "screen");
    match client
        .post(format!("{}/perception/visual", cfg.backend_base_url.trim_end_matches('/')))
        .bearer_auth(&cfg.admin_token)
        .multipart(form)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => match response.json::<UploadResult>().await {
            Ok(result) if result.processing => cfg.runtime.record("pushed", true, true),
            Ok(_) => cfg.runtime.record("backend_not_processing", true, false),
            Err(_) => cfg.runtime.record("failed", true, false),
        },
        _ => cfg.runtime.record("failed", true, false),
    }
}

#[derive(Deserialize)]
struct Preflight {
    enabled: bool,
}

#[derive(Deserialize)]
struct UploadResult {
    processing: bool,
}

fn unix_timestamp() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or(0.0)
}

fn encode_jpeg(frame: RgbImage) -> Result<Vec<u8>, String> {
    let max_side = frame.width().max(frame.height());
    let resized = if max_side > MAX_IMAGE_SIDE {
        let scale = MAX_IMAGE_SIDE as f64 / max_side as f64;
        image::imageops::resize(
            &frame,
            (frame.width() as f64 * scale).round() as u32,
            (frame.height() as f64 * scale).round() as u32,
            FilterType::Triangle,
        )
    } else {
        frame
    };
    let mut output = Vec::new();
    JpegEncoder::new_with_quality(&mut output, 82)
        .write_image(
            resized.as_raw(),
            resized.width(),
            resized.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| format!("JPEG 编码失败: {error}"))?;
    Ok(output)
}

fn perceptual_hash(frame: &RgbImage) -> u64 {
    let thumbnail = image::imageops::resize(frame, 9, 8, FilterType::Triangle);
    let mut hash = 0u64;
    for y in 0..8 {
        for x in 0..8 {
            let left = luminance(thumbnail.get_pixel(x, y).0);
            let right = luminance(thumbnail.get_pixel(x + 1, y).0);
            hash = (hash << 1) | u64::from(left > right);
        }
    }
    hash
}

fn luminance(pixel: [u8; 3]) -> u16 {
    299 * pixel[0] as u16 + 587 * pixel[1] as u16 + 114 * pixel[2] as u16
}

fn hamming_distance(left: u64, right: u64) -> u32 {
    (left ^ right).count_ones()
}

#[cfg(target_os = "windows")]
fn has_unlocked_desktop() -> bool {
    use windows::Win32::System::StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_SWITCHDESKTOP};
    unsafe {
        // Opening the active input desktop with switch permission fails while the
        // workstation is locked or this process has no interactive desktop session.
        match OpenInputDesktop(Default::default(), false, DESKTOP_SWITCHDESKTOP) {
            Ok(desktop) => {
                let _ = CloseDesktop(desktop);
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn has_unlocked_desktop() -> bool { false }

#[cfg(target_os = "windows")]
fn capture_primary_screen() -> Result<RgbImage, String> {
    use std::ffi::c_void;
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);
        if width <= 0 || height <= 0 {
            return Err("主屏尺寸不可用".into());
        }
        let screen_dc = GetDC(HWND::default());
        if screen_dc.0.is_null() {
            return Err("无法获取屏幕 DC".into());
        }
        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.0.is_null() {
            let _ = ReleaseDC(HWND::default(), screen_dc);
            return Err("无法创建内存 DC".into());
        }
        let bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // Negative is a top-down DIB: no row reversal and no second image buffer.
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            bmiColors: [RGBQUAD::default(); 1],
        };
        let mut bits: *mut c_void = std::ptr::null_mut();
        let bitmap = match CreateDIBSection(
            screen_dc,
            &bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            HANDLE::default(),
            0,
        ) {
            Ok(bitmap) => bitmap,
            Err(error) => {
                let _ = DeleteDC(memory_dc);
                let _ = ReleaseDC(HWND::default(), screen_dc);
                return Err(format!("无法创建截图位图: {error}"));
            }
        };
        let previous = SelectObject(memory_dc, bitmap);
        let copied = BitBlt(memory_dc, 0, 0, width, height, screen_dc, 0, 0, SRCCOPY).is_ok();
        let byte_len = width as usize * height as usize * 4;
        let bgra = if copied && !bits.is_null() {
            std::slice::from_raw_parts(bits as *const u8, byte_len).to_vec()
        } else {
            Vec::new()
        };
        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(HWND::default(), screen_dc);
        if bgra.len() != byte_len {
            return Err("截图复制失败".into());
        }
        let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
        for pixel in bgra.chunks_exact(4) {
            rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
        }
        RgbImage::from_raw(width as u32, height as u32, rgb)
            .ok_or_else(|| "截图像素格式无效".into())
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_primary_screen() -> Result<RgbImage, String> {
    Err("visual_observation_not_supported_on_this_platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visual_config_defaults_to_opt_in_and_five_minutes() {
        let config = VisualPerceptionConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.sample_interval_seconds, 300);
    }

    #[test]
    fn hash_distance_detects_material_change() {
        assert_eq!(hamming_distance(0, 0), 0);
        assert_eq!(hamming_distance(0, u64::MAX), 64);
    }

    #[test]
    fn sample_interval_is_bounded() {
        assert!(VisualPerceptionConfig::validated(true, 60).is_ok());
        assert!(VisualPerceptionConfig::validated(true, 59).is_err());
        assert!(VisualPerceptionConfig::validated(true, 3601).is_err());
    }
}

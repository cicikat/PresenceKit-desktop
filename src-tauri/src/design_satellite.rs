use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const READY_EVENT: &str = "design-satellite-ready";
pub const COMMAND_EVENT: &str = "design-satellite-command";
pub const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NativeSatelliteCapabilities {
    pub platform: String,
    pub status: String,
    pub capabilities: Vec<String>,
    pub reason: Option<String>,
}

pub fn capabilities_for_platform(platform: &str) -> NativeSatelliteCapabilities {
    let capabilities = vec![
        "platform", "transparent-window", "native-satellite-v1", "interactive",
        "passthrough", "presenter-snapshot", "navigation-snapshot",
    ].into_iter().map(String::from).collect();
    match platform {
        "windows" => NativeSatelliteCapabilities { platform: platform.into(), status: "supported".into(), capabilities, reason: None },
        "macos" | "linux" => NativeSatelliteCapabilities { platform: platform.into(), status: "experimental".into(), capabilities, reason: Some("真实窗口验收未完成".into()) },
        _ => NativeSatelliteCapabilities { platform: platform.into(), status: "unavailable".into(), capabilities: Vec::new(), reason: Some("平台未实现 native satellite".into()) },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NativeSurfaceSize {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum NativeSurfaceMargin {
    Uniform(f64),
    Sides {
        top: f64,
        right: f64,
        bottom: f64,
        left: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NativeSurfaceOffset {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeSurfaceSpec {
    pub id: String,
    pub kind: String,
    pub entry: String,
    #[serde(default)]
    pub style: Option<String>,
    pub pointer_mode: String,
    pub z_order: String,
    pub size: NativeSurfaceSize,
    #[serde(default)]
    pub visual_bleed: Option<NativeSurfaceMargin>,
    #[serde(default)]
    pub content_inset: Option<NativeSurfaceMargin>,
    // Kept for schema v2 packages created before visualBleed existed.
    #[serde(default)]
    pub margin: Option<NativeSurfaceMargin>,
    #[serde(default)]
    pub anchor: Option<String>,
    #[serde(default)]
    pub offset: Option<NativeSurfaceOffset>,
    #[serde(default)]
    pub requires: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SurfaceBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub dpi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeSurfaceDescriptor {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub pointer_mode: String,
    pub z_order: String,
    pub bounds: SurfaceBounds,
    pub content_rect: SurfaceBounds,
    pub ready: bool,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurfaceBoundsUpdate {
    pub id: String,
    pub bounds: SurfaceBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SatelliteReadyPayload {
    pub generation: u64,
    pub surface_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SatelliteCommandPayload {
    pub generation: u64,
    pub surface_id: String,
    pub command: String,
    #[serde(default)]
    pub params: serde_json::Value,
    pub correlation_id: String,
    pub label: String,
}

#[derive(Debug, Clone)]
struct ActiveSurface {
    spec: NativeSurfaceSpec,
    label: String,
    bounds: SurfaceBounds,
    content_rect: SurfaceBounds,
    ready: bool,
}

#[derive(Debug, Default)]
struct Coordinator {
    mod_id: Option<String>,
    generation: Option<u64>,
    last_generation: u64,
    surfaces: HashMap<String, ActiveSurface>,
}

#[derive(Debug, Default)]
pub struct DesignSatelliteState {
    coordinator: Mutex<Coordinator>,
}

#[tauri::command]
pub fn get_design_satellite_capabilities() -> NativeSatelliteCapabilities {
    capabilities_for_platform(std::env::consts::OS)
}

fn is_safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

fn is_safe_package_path(value: &str, extension: &str) -> bool {
    if value.is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || !value.ends_with(extension)
    {
        return false;
    }
    value.split('/').all(|part| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part.chars().all(|character| {
                character.is_ascii_alphanumeric()
                    || character == '_'
                    || character == '-'
                    || character == '.'
            })
    })
}

// Keep this separate from the window builder so the manifest boundary is testable
// without a desktop runtime.
fn validate_spec(spec: &NativeSurfaceSpec) -> Result<(), String> {
    if !is_safe_segment(&spec.id) {
        return Err(format!("surface id 不安全: {}", spec.id));
    }
    if spec.kind != "halo" && spec.kind != "island" {
        return Err(format!("surface kind 不支持: {}", spec.kind));
    }
    if !is_safe_package_path(&spec.entry, ".js") {
        return Err(format!("surface entry 路径不安全: {}", spec.entry));
    }
    if let Some(style) = &spec.style {
        if !is_safe_package_path(style, ".css") {
            return Err(format!("surface style 路径不安全: {}", style));
        }
    }
    if spec.pointer_mode != "passthrough" && spec.pointer_mode != "interactive" {
        return Err(format!(
            "surface pointer_mode 不支持: {}",
            spec.pointer_mode
        ));
    }
    if spec.kind == "halo" && spec.pointer_mode != "passthrough" {
        return Err("halo 必须使用 passthrough".to_string());
    }
    if spec.z_order != "owned" && spec.z_order != "always-on-top" {
        return Err(format!("surface z_order 不支持: {}", spec.z_order));
    }
    if spec.kind == "island" && spec.anchor.is_none() {
        return Err("island 必须设置 anchor".to_string());
    }
    if let Some(anchor) = &spec.anchor {
        if !matches!(
            anchor.as_str(),
            "main.top" | "main.right" | "main.bottom" | "main.left"
        ) {
            return Err(format!("surface anchor 不支持: {anchor}"));
        }
    }
    if !spec.size.width.is_finite()
        || !spec.size.height.is_finite()
        || spec.size.width <= 0.0
        || spec.size.height <= 0.0
    {
        return Err("surface size 必须是正数".to_string());
    }
    if let Some(offset) = &spec.offset {
        if !offset.x.is_finite() || !offset.y.is_finite() {
            return Err("surface offset 必须是有限数值".to_string());
        }
    }
    for required in &spec.requires {
        if !matches!(required.as_str(), "platform" | "transparent-window" | "native-satellite-v1" | "interactive" | "passthrough" | "presenter-snapshot" | "navigation-snapshot" | "navigation" | "presenters") {
            return Err(format!("surface capability 不支持: {required}"));
        }
    }
    for inset in [&spec.visual_bleed, &spec.content_inset, &spec.margin] {
        let Some(margin) = inset else { continue };
        let values = match margin {
            NativeSurfaceMargin::Uniform(value) => [*value; 4],
            NativeSurfaceMargin::Sides {
                top,
                right,
                bottom,
                left,
            } => [*top, *right, *bottom, *left],
        };
        if values
            .iter()
            .any(|value| !value.is_finite() || *value < 0.0)
        {
            return Err("surface margin 必须是有限非负数".to_string());
        }
    }
    if !spec
        .requires
        .iter()
        .all(|requirement| is_safe_segment(requirement))
    {
        return Err("surface requires 包含不安全能力名".to_string());
    }
    Ok(())
}

fn surface_label(mod_id: &str, generation: u64, surface_id: &str) -> String {
    format!("design-satellite-{mod_id}-{generation}-{surface_id}")
}

fn physical_logical(value: f64, dpi: f64) -> u32 {
    (value.max(1.0) * dpi.max(0.1)).round().max(1.0) as u32
}

fn margin_values(margin: Option<&NativeSurfaceMargin>, dpi: f64) -> (i32, i32, i32, i32) {
    let values = match margin {
        Some(NativeSurfaceMargin::Uniform(value)) => (*value, *value, *value, *value),
        Some(NativeSurfaceMargin::Sides {
            top,
            right,
            bottom,
            left,
        }) => (*top, *right, *bottom, *left),
        None => (0.0, 0.0, 0.0, 0.0),
    };
    (
        (values.0.max(0.0) * dpi).round() as i32,
        (values.1.max(0.0) * dpi).round() as i32,
        (values.2.max(0.0) * dpi).round() as i32,
        (values.3.max(0.0) * dpi).round() as i32,
    )
}

fn inset_bounds(bounds: &SurfaceBounds, inset: Option<&NativeSurfaceMargin>) -> SurfaceBounds {
    let (top, right, bottom, left) = margin_values(inset, bounds.dpi);
    SurfaceBounds {
        x: bounds.x + left,
        y: bounds.y + top,
        width: bounds.width.saturating_sub((left + right).max(0) as u32),
        height: bounds.height.saturating_sub((top + bottom).max(0) as u32),
        dpi: bounds.dpi,
    }
}

fn calculate_layout(spec: &NativeSurfaceSpec, main: &SurfaceBounds) -> (SurfaceBounds, SurfaceBounds) {
    let dpi = main.dpi.max(0.1);
    let offset = spec
        .offset
        .as_ref()
        .cloned()
        .unwrap_or(NativeSurfaceOffset { x: 0.0, y: 0.0 });
    let offset_x = (offset.x * dpi).round() as i32;
    let offset_y = (offset.y * dpi).round() as i32;
    if spec.kind == "halo" {
        let bleed = spec.visual_bleed.as_ref().or(spec.margin.as_ref());
        let (top, right, bottom, left) = margin_values(bleed, dpi);
        let bounds = SurfaceBounds {
            x: main.x - left,
            y: main.y - top,
            width: main.width.saturating_add((left + right).max(0) as u32),
            height: main.height.saturating_add((top + bottom).max(0) as u32),
            dpi,
        };
        let content_rect = inset_bounds(main, spec.content_inset.as_ref());
        return (bounds, content_rect);
    }
    let width = physical_logical(spec.size.width, dpi);
    let height = physical_logical(spec.size.height, dpi);
    let anchor = spec.anchor.as_deref().unwrap_or("main.right");
    let (x, y) = match anchor {
        "main.top" => (
            main.x + (main.width as i32 - width as i32) / 2,
            main.y - height as i32,
        ),
        "main.bottom" => (
            main.x + (main.width as i32 - width as i32) / 2,
            main.y + main.height as i32,
        ),
        "main.left" => (
            main.x - width as i32,
            main.y + (main.height as i32 - height as i32) / 2,
        ),
        _ => (
            main.x + main.width as i32,
            main.y + (main.height as i32 - height as i32) / 2,
        ),
    };
    let content_bounds = SurfaceBounds {
        x: x + offset_x,
        y: y + offset_y,
        width,
        height,
        dpi,
    };
    let (top, right, bottom, left) = margin_values(spec.visual_bleed.as_ref(), dpi);
    let bounds = SurfaceBounds {
        x: content_bounds.x - left,
        y: content_bounds.y - top,
        width: content_bounds.width.saturating_add((left + right).max(0) as u32),
        height: content_bounds.height.saturating_add((top + bottom).max(0) as u32),
        dpi,
    };
    let content_rect = inset_bounds(&content_bounds, spec.content_inset.as_ref());
    (bounds, content_rect)
}

fn main_bounds(app: &AppHandle) -> Result<SurfaceBounds, String> {
    let main = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window 不存在".to_string())?;
    let position = main.outer_position().map_err(|error| error.to_string())?;
    let size = main.outer_size().map_err(|error| error.to_string())?;
    let dpi = main.scale_factor().map_err(|error| error.to_string())?;
    Ok(SurfaceBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        dpi,
    })
}

fn apply_bounds(window: &WebviewWindow, bounds: &SurfaceBounds) -> Result<(), String> {
    window
        .set_position(PhysicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(bounds.width, bounds.height))
        .map_err(|error| error.to_string())
}

fn close_active(app: &AppHandle, coordinator: &mut Coordinator) -> usize {
    let closed = coordinator.surfaces.len();
    for surface in coordinator.surfaces.values() {
        if let Some(window) = app.get_webview_window(&surface.label) {
            let _ = window.close();
        }
    }
    coordinator.surfaces.clear();
    coordinator.mod_id = None;
    coordinator.generation = None;
    closed
}

fn sync_bounds_locked(app: &AppHandle, coordinator: &mut Coordinator) -> Result<(), String> {
    let main = main_bounds(app)?;
    for surface in coordinator.surfaces.values_mut() {
        let (bounds, content_rect) = calculate_layout(&surface.spec, &main);
        surface.content_rect = content_rect;
        if bounds == surface.bounds {
            continue;
        }
        let window = app
            .get_webview_window(&surface.label)
            .ok_or_else(|| format!("surface window 丢失: {}", surface.label))?;
        apply_bounds(&window, &bounds)?;
        surface.bounds = bounds;
    }
    Ok(())
}

fn ensure_locked(
    app: &AppHandle,
    coordinator: &mut Coordinator,
    mod_id: String,
    generation: u64,
    specs: Vec<NativeSurfaceSpec>,
) -> Result<Vec<NativeSurfaceDescriptor>, String> {
    if !is_safe_segment(&mod_id) {
        return Err("mod_id 不安全".to_string());
    }
    if generation == 0 {
        return Err("generation 必须从 1 开始".to_string());
    }
    if generation < coordinator.last_generation {
        return Err(format!("拒绝过期 generation: {generation}"));
    }
    if specs.is_empty() {
        close_active(app, coordinator);
        coordinator.last_generation = coordinator.last_generation.max(generation);
        coordinator.mod_id = Some(mod_id);
        coordinator.generation = Some(generation);
        return Ok(Vec::new());
    }
    let mut ids = std::collections::HashSet::new();
    for spec in &specs {
        validate_spec(spec)?;
        if !ids.insert(spec.id.clone()) {
            return Err(format!("surface id 重复: {}", spec.id));
        }
    }
    if coordinator.generation == Some(generation) && coordinator.mod_id.as_deref() == Some(&mod_id)
    {
        let current_ids: std::collections::HashSet<_> =
            coordinator.surfaces.keys().cloned().collect();
        let requested_ids: std::collections::HashSet<_> =
            specs.iter().map(|spec| spec.id.clone()).collect();
        if current_ids != requested_ids {
            return Err("同一 generation 不允许替换 surface 集合".to_string());
        }
        for spec in specs {
            if let Some(surface) = coordinator.surfaces.get_mut(&spec.id) {
                surface.spec = spec;
            }
        }
        sync_bounds_locked(app, coordinator)?;
        return Ok(descriptors(app, coordinator));
    }
    close_active(app, coordinator);
    let main = main_bounds(app)?;
    for spec in specs {
        let label = surface_label(&mod_id, generation, &spec.id);
        let (bounds, content_rect) = calculate_layout(&spec, &main);
        let url = format!(
            "index.html?window=design-satellite&mod_id={mod_id}&surface={}&generation={generation}",
            spec.id
        );
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title(format!("PresenceKit surface: {}", spec.id))
            .inner_size(spec.size.width, spec.size.height)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_top(spec.z_order == "always-on-top")
            .focusable(spec.pointer_mode == "interactive")
            .resizable(false)
            .visible(false);
        builder = builder
            .owner(
                &app.get_webview_window(MAIN_WINDOW_LABEL)
                    .ok_or_else(|| "main window 不存在".to_string())?,
            )
            .map_err(|error| error.to_string())?;
        let window = builder.build().map_err(|error| error.to_string())?;
        window
            .set_ignore_cursor_events(spec.pointer_mode == "passthrough")
            .map_err(|error| error.to_string())?;
        window
            .set_focusable(spec.pointer_mode == "interactive")
            .map_err(|error| error.to_string())?;
        apply_bounds(&window, &bounds)?;
        coordinator.surfaces.insert(
            spec.id.clone(),
            ActiveSurface {
                spec,
                label,
                bounds,
                content_rect,
                ready: false,
            },
        );
    }
    coordinator.mod_id = Some(mod_id);
    coordinator.generation = Some(generation);
    coordinator.last_generation = generation;
    Ok(descriptors(app, coordinator))
}

fn descriptors(app: &AppHandle, coordinator: &Coordinator) -> Vec<NativeSurfaceDescriptor> {
    coordinator
        .surfaces
        .values()
        .map(|surface| NativeSurfaceDescriptor {
            id: surface.spec.id.clone(),
            label: surface.label.clone(),
            kind: surface.spec.kind.clone(),
            pointer_mode: surface.spec.pointer_mode.clone(),
            z_order: surface.spec.z_order.clone(),
            bounds: surface.bounds.clone(),
            content_rect: surface.content_rect.clone(),
            ready: surface.ready,
            visible: app
                .get_webview_window(&surface.label)
                .is_some_and(|window| window.is_visible().unwrap_or(false)),
        })
        .collect()
}

fn current_surface<'a>(
    coordinator: &'a mut Coordinator,
    generation: u64,
    surface_id: &str,
) -> Result<&'a mut ActiveSurface, String> {
    if coordinator.generation != Some(generation) {
        return Err("surface generation 已过期".to_string());
    }
    coordinator
        .surfaces
        .get_mut(surface_id)
        .ok_or_else(|| "surface 未注册".to_string())
}

#[tauri::command]
pub async fn ensure_design_satellites(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    mod_id: String,
    generation: u64,
    surface_specs: Vec<NativeSurfaceSpec>,
) -> Result<Vec<NativeSurfaceDescriptor>, String> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    ensure_locked(&app, &mut coordinator, mod_id, generation, surface_specs)
}

#[tauri::command]
pub fn update_design_satellite_bounds(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    generation: u64,
    bounds: Vec<SurfaceBoundsUpdate>,
) -> Result<Vec<NativeSurfaceDescriptor>, String> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    if coordinator.generation != Some(generation) {
        return Err("拒绝过期 surface bounds".to_string());
    }
    for update in bounds {
        let surface = current_surface(&mut coordinator, generation, &update.id)?;
        if surface.bounds == update.bounds {
            continue;
        }
        surface.bounds = update.bounds.clone();
        if let Some(window) = app.get_webview_window(&surface.label) {
            apply_bounds(&window, &surface.bounds)?;
        }
    }
    Ok(descriptors(&app, &coordinator))
}

#[tauri::command]
pub fn set_design_satellites_visible(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    generation: u64,
    visible: bool,
) -> Result<(), String> {
    let coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    if coordinator.generation != Some(generation) {
        return Ok(());
    }
    for surface in coordinator.surfaces.values() {
        if let Some(window) = app.get_webview_window(&surface.label) {
            if visible {
                window.show().map_err(|error| error.to_string())?;
            } else {
                window.hide().map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn destroy_design_satellites(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    generation: u64,
) -> Result<(), String> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    if coordinator.generation == Some(generation) {
        close_active(&app, &mut coordinator);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct DesignSatelliteTeardownAck {
    pub closed: usize,
    pub generation: Option<u64>,
}

/// Main-window-only reset used by "restore default". It deliberately clears
/// the registered owner instead of relying on a caller to remember generation.
#[tauri::command]
pub fn destroy_current_design_satellites(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, DesignSatelliteState>,
) -> Result<DesignSatelliteTeardownAck, String> {
    if window.label() != MAIN_WINDOW_LABEL {
        return Err("only the main window may reset design satellites".to_string());
    }
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator lock failed".to_string())?;
    let generation = coordinator.generation;
    let closed = close_active(&app, &mut coordinator);
    Ok(DesignSatelliteTeardownAck { closed, generation })
}

#[tauri::command]
pub fn design_satellite_ready(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    generation: u64,
    surface_id: String,
    label: String,
) -> Result<(), String> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    let surface = current_surface(&mut coordinator, generation, &surface_id)?;
    if surface.label != label {
        return Err("surface label 不匹配".to_string());
    }
    surface.ready = true;
    app.emit_to(
        MAIN_WINDOW_LABEL,
        READY_EVENT,
        SatelliteReadyPayload {
            generation,
            surface_id,
            label,
        },
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn design_satellite_command(
    app: AppHandle,
    state: State<'_, DesignSatelliteState>,
    generation: u64,
    surface_id: String,
    command: String,
    params: serde_json::Value,
    correlation_id: String,
    label: String,
) -> Result<(), String> {
    if !is_safe_segment(&surface_id)
        || command.len() > 100
        || correlation_id.len() > 120
        || label.len() > 200
    {
        return Err("satellite command 元数据不安全".to_string());
    }
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| "surface coordinator 锁失败".to_string())?;
    let surface = current_surface(&mut coordinator, generation, &surface_id)?;
    if surface.label != label {
        return Err("surface label 不匹配".to_string());
    }
    app.emit_to(
        MAIN_WINDOW_LABEL,
        COMMAND_EVENT,
        SatelliteCommandPayload {
            generation,
            surface_id,
            command,
            params,
            correlation_id,
            label,
        },
    )
    .map_err(|error| error.to_string())
}

pub fn sync_from_main_event(app: &AppHandle, event: &WindowEvent) {
    if !matches!(
        event,
        WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
    ) {
        return;
    }
    let state = app.state::<DesignSatelliteState>();
    if let Ok(mut coordinator) = state.coordinator.lock() {
        let _ = sync_bounds_locked(app, &mut coordinator);
    };
}

pub fn destroy_for_main_close(app: &AppHandle) {
    let state = app.state::<DesignSatelliteState>();
    if let Ok(mut coordinator) = state.coordinator.lock() {
        close_active(app, &mut coordinator);
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn island(anchor: &str) -> NativeSurfaceSpec {
        NativeSurfaceSpec {
            id: "island".into(),
            kind: "island".into(),
            entry: "surfaces/island.js".into(),
            style: None,
            pointer_mode: "interactive".into(),
            z_order: "owned".into(),
            size: NativeSurfaceSize {
                width: 200.0,
                height: 100.0,
            },
            visual_bleed: None,
            content_inset: None,
            margin: None,
            anchor: Some(anchor.into()),
            offset: None,
            requires: Vec::new(),
        }
    }

    #[test]
    fn rejects_unsafe_labels_and_paths() {
        assert!(!is_safe_segment("../escape"));
        assert!(!is_safe_package_path("../escape.js", ".js"));
        assert!(!is_safe_package_path("surfaces\\island.js", ".js"));
        assert!(is_safe_package_path("surfaces/island.js", ".js"));
    }

    #[test]
    fn converts_logical_sizes_at_common_dpi_values() {
        for (dpi, expected) in [(1.0, 200), (1.25, 250), (1.5, 300), (2.0, 400)] {
            assert_eq!(physical_logical(200.0, dpi), expected);
        }
    }

    #[test]
    fn lays_out_negative_monitor_coordinates_and_anchors() {
        let main = SurfaceBounds {
            x: -1920,
            y: 40,
            width: 1200,
            height: 800,
            dpi: 1.25,
        };
        let right = calculate_layout(&island("main.right"), &main).0;
        assert_eq!(right.x, -720);
        assert_eq!(right.y, 377);
        let halo = NativeSurfaceSpec {
            id: "halo".into(),
            kind: "halo".into(),
            entry: "halo.js".into(),
            style: None,
            pointer_mode: "passthrough".into(),
            z_order: "owned".into(),
            size: NativeSurfaceSize {
                width: 1.0,
                height: 1.0,
            },
            visual_bleed: Some(NativeSurfaceMargin::Uniform(240.0)),
            content_inset: None,
            margin: Some(NativeSurfaceMargin::Uniform(240.0)),
            anchor: None,
            offset: None,
            requires: Vec::new(),
        };
        let halo_bounds = calculate_layout(&halo, &main).0;
        assert_eq!(halo_bounds.x, -2220);
        assert_eq!(halo_bounds.width, 1800);
        let (_, content_rect) = calculate_layout(&halo, &main);
        assert_eq!(content_rect, main);
    }

    #[test]
    fn keeps_content_rect_independent_from_visual_bleed() {
        let main = SurfaceBounds { x: -1200, y: 80, width: 1600, height: 900, dpi: 1.75 };
        let mut surface = island("main.left");
        surface.size = NativeSurfaceSize { width: 200.0, height: 100.0 };
        surface.visual_bleed = Some(NativeSurfaceMargin::Sides { top: 12.0, right: 24.0, bottom: 36.0, left: 48.0 });
        surface.content_inset = Some(NativeSurfaceMargin::Sides { top: 8.0, right: 10.0, bottom: 6.0, left: 4.0 });

        let (bounds, content_rect) = calculate_layout(&surface, &main);
        assert_eq!(bounds, SurfaceBounds { x: -1634, y: 421, width: 476, height: 259, dpi: 1.75 });
        assert_eq!(content_rect, SurfaceBounds { x: -1543, y: 456, width: 325, height: 150, dpi: 1.75 });
    }

    #[test]
    fn applies_content_inset_to_halo_content_not_outer_bleed_bounds() {
        let main = SurfaceBounds { x: -1920, y: 40, width: 1200, height: 800, dpi: 1.25 };
        let mut halo = island("main.right");
        halo.id = "halo".into();
        halo.kind = "halo".into();
        halo.pointer_mode = "passthrough".into();
        halo.anchor = None;
        halo.visual_bleed = Some(NativeSurfaceMargin::Uniform(240.0));
        halo.content_inset = Some(NativeSurfaceMargin::Sides { top: 20.0, right: 40.0, bottom: 60.0, left: 80.0 });

        let (bounds, content_rect) = calculate_layout(&halo, &main);
        assert_eq!(bounds, SurfaceBounds { x: -2220, y: -260, width: 1800, height: 1400, dpi: 1.25 });
        assert_eq!(content_rect, SurfaceBounds { x: -1820, y: 65, width: 1050, height: 700, dpi: 1.25 });
    }

    #[test]
    fn validates_pointer_modes_and_halo_contract() {
        assert!(validate_spec(&island("main.top")).is_ok());
        let mut invalid = island("main.top");
        invalid.pointer_mode = "hybrid".into();
        assert!(validate_spec(&invalid).is_err());
        invalid = island("main.top");
        invalid.kind = "halo".into();
        assert!(validate_spec(&invalid).is_err());
    }

    #[test]
    fn reports_platform_capability_status_without_cross_platform_claims() {
        assert_eq!(capabilities_for_platform("windows").status, "supported");
        assert_eq!(capabilities_for_platform("linux").status, "experimental");
        assert_eq!(capabilities_for_platform("freebsd").status, "unavailable");
    }

    #[test]
    fn validates_declared_capability_names() {
        let mut spec = island("main.top");
        spec.requires = vec!["navigation".into(), "made-up".into()];
        assert!(validate_spec(&spec).is_err());
        spec.requires = vec!["navigation".into(), "presenters".into()];
        assert!(validate_spec(&spec).is_ok());
    }
}

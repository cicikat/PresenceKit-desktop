use std::sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use windows::core::Interface;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONULL};
use windows::Win32::System::{
    Com::*, StationsAndDesktops::*, SystemInformation::GetTickCount64, Threading::*,
};
use windows::Win32::UI::{
    Accessibility::*, HiDpi::*, Input::KeyboardAndMouse::*, WindowsAndMessaging::*,
};

use super::super::*;

static MONITOR_UNTIL: AtomicU64 = AtomicU64::new(0);
static ACTIVITY: AtomicU64 = AtomicU64::new(0);
static PAUSE: AtomicU64 = AtomicU64::new(0);
static EMERGENCY: AtomicU64 = AtomicU64::new(0);
static MONITOR: OnceLock<Result<(), &'static str>> = OnceLock::new();

pub fn arm_monitor(seconds: u64) {
    let now = unsafe { GetTickCount64() };
    MONITOR_UNTIL.store(now + seconds * 1000, Ordering::Relaxed);
}

fn monitoring() -> bool {
    (unsafe { GetTickCount64() }) < MONITOR_UNTIL.load(Ordering::Relaxed)
}

pub fn activity() -> u64 {
    ACTIVITY.load(Ordering::SeqCst)
}

pub fn pause_toggle() -> u64 {
    PAUSE.load(Ordering::SeqCst)
}

pub fn emergency() -> u64 {
    EMERGENCY.load(Ordering::SeqCst)
}

pub fn start_monitor() -> Result<(), &'static str> {
    *MONITOR.get_or_init(|| {
        let (ready, receiver) = std::sync::mpsc::sync_channel(1);
        std::thread::Builder::new()
            .name("cu-input-monitor".into())
            .spawn(move || unsafe {
                let Ok(mouse) =
                    SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), HINSTANCE::default(), 0)
                else {
                    return;
                };
                let Ok(keyboard) =
                    SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), HINSTANCE::default(), 0)
                else {
                    let _ = UnhookWindowsHookEx(mouse);
                    return;
                };
                if ready.send(true).is_ok() {
                    let mut msg = MSG::default();
                    while GetMessageW(&mut msg, HWND::default(), 0, 0).0 > 0 {}
                }
                EMERGENCY.fetch_add(1, Ordering::SeqCst);
                let _ = UnhookWindowsHookEx(keyboard);
                let _ = UnhookWindowsHookEx(mouse);
            })
            .map_err(|_| "input_monitor_unavailable")?;
        match receiver.recv_timeout(Duration::from_secs(2)) {
            Ok(true) => Ok(()),
            _ => Err("input_monitor_unavailable"),
        }
    })
}

unsafe extern "system" fn mouse_hook(code: i32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if code >= 0 && monitoring() && (*(lp.0 as *const MSLLHOOKSTRUCT)).flags & 1 == 0 {
        ACTIVITY.fetch_add(1, Ordering::SeqCst);
    }
    CallNextHookEx(HHOOK::default(), code, wp, lp)
}

unsafe extern "system" fn keyboard_hook(code: i32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if code >= 0 && monitoring() && matches!(wp.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN) {
        let key = &*(lp.0 as *const KBDLLHOOKSTRUCT);
        if !key.flags.contains(LLKHF_INJECTED) {
            let vk = VIRTUAL_KEY(key.vkCode as u16);
            let chord = GetAsyncKeyState(i32::from(VK_CONTROL.0)) < 0
                && GetAsyncKeyState(i32::from(VK_SHIFT.0)) < 0;
            match vk {
                VK_F12 if chord => {
                    EMERGENCY.fetch_add(1, Ordering::SeqCst);
                }
                VK_F11 if chord => {
                    if GetAsyncKeyState(i32::from(VK_F11.0)) >= 0 {
                        PAUSE.fetch_add(1, Ordering::SeqCst);
                    }
                }
                VK_LCONTROL | VK_RCONTROL | VK_CONTROL | VK_LSHIFT | VK_RSHIFT | VK_SHIFT => {}
                _ => {
                    ACTIVITY.fetch_add(1, Ordering::SeqCst);
                }
            }
        }
    }
    CallNextHookEx(HHOOK::default(), code, wp, lp)
}

pub fn unlocked() -> bool {
    unsafe {
        let Ok(active) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS)
        else {
            return false;
        };
        let mut name = [0u16; 64];
        let read = GetUserObjectInformationW(
            HANDLE(active.0),
            UOI_NAME,
            Some(name.as_mut_ptr().cast()),
            128,
            None,
        );
        let _ = CloseDesktop(active);
        read.is_ok()
            && name[..8]
                .iter()
                .copied()
                .eq("Default".encode_utf16().chain([0]))
    }
}

fn hwnd(window: WindowId) -> HWND {
    HWND(window.handle as usize as *mut _)
}

fn identify(handle: HWND) -> Option<WindowId> {
    unsafe {
        if !IsWindow(handle).as_bool()
            || !IsWindowVisible(handle).as_bool()
            || IsIconic(handle).as_bool()
        {
            return None;
        }
        let mut pid = 0;
        let thread = GetWindowThreadProcessId(handle, Some(&mut pid));
        if thread == 0 || pid == std::process::id() {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let (mut created, mut exited, mut kernel, mut user) = Default::default();
        let result = GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user);
        let _ = CloseHandle(process);
        result.ok()?;
        Some(WindowId {
            handle: handle.0 as usize as u64,
            pid,
            thread,
            created: [created.dwHighDateTime, created.dwLowDateTime],
        })
    }
}

pub fn valid_window(window: WindowId) -> bool {
    identify(hwnd(window)) == Some(window)
}

pub fn windows() -> Result<Vec<WindowChoice>, &'static str> {
    if !unlocked() {
        return Err("desktop_locked");
    }
    unsafe extern "system" fn collect(handle: HWND, context: LPARAM) -> BOOL {
        let choices = &mut *(context.0 as *mut Vec<WindowChoice>);
        if choices.len() >= 128 {
            return false.into();
        }
        let mut title = [0u16; 160];
        let len = GetWindowTextW(handle, &mut title) as usize;
        if len > 0 {
            if let Some(id) = identify(handle) {
                choices.push(WindowChoice {
                    id,
                    title: String::from_utf16_lossy(&title[..len]),
                });
            }
        }
        true.into()
    }
    let mut choices = Vec::<WindowChoice>::new();
    let result = unsafe {
        EnumWindows(
            Some(collect),
            LPARAM((&mut choices as *mut Vec<WindowChoice>) as isize),
        )
    };
    if result.is_err() && choices.len() < 128 {
        return Err("window_list_failed");
    }
    Ok(choices)
}

struct Dpi(DPI_AWARENESS_CONTEXT);

impl Dpi {
    fn physical() -> Result<Self, &'static str> {
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.0.is_null() {
            return Err("dpi_unavailable");
        }
        Ok(Self(previous))
    }
}

impl Drop for Dpi {
    fn drop(&mut self) {
        unsafe {
            SetThreadDpiAwarenessContext(self.0);
        }
    }
}

fn bounds(rect: RECT) -> Bounds {
    Bounds {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
    }
}

pub fn surface(scope: Scope) -> Result<Surface, &'static str> {
    let _dpi = Dpi::physical()?;
    if !unlocked() {
        return Err("desktop_locked");
    }
    unsafe {
        let handle = GetForegroundWindow();
        let window = identify(handle).ok_or("foreground_unavailable")?;
        let desktop = Bounds {
            x: GetSystemMetrics(SM_XVIRTUALSCREEN),
            y: GetSystemMetrics(SM_YVIRTUALSCREEN),
            width: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            height: GetSystemMetrics(SM_CYVIRTUALSCREEN),
        };
        let bounds = match scope {
            Scope::Window { window: allowed } if allowed == window => {
                let mut rect = RECT::default();
                GetWindowRect(handle, &mut rect).map_err(|_| "window_unavailable")?;
                bounds(rect)
            }
            Scope::Window { .. } => return Err("scope_changed"),
            Scope::Desktop => desktop,
        };
        let dpi = GetDpiForWindow(handle);
        if bounds.width < 2
            || bounds.height < 2
            || desktop.width < 2
            || desktop.height < 2
            || dpi == 0
        {
            return Err("geometry_unavailable");
        }
        let mut gui = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        GetGUIThreadInfo(window.thread, &mut gui).map_err(|_| "focus_unavailable")?;
        Ok(Surface {
            window,
            bounds,
            desktop,
            dpi,
            focused: gui.hwndFocus.0 as usize as u64,
        })
    }
}

pub fn capture(scope: Scope, surface: Surface) -> Result<(Vec<u8>, [u8; 32]), &'static str> {
    use crate::sensor::visual::{capture_region, encode_jpeg};
    let _dpi = Dpi::physical()?;
    let area = surface.bounds;
    let (handle, x, y) = match scope {
        Scope::Window { window } => (hwnd(window), 0, 0),
        Scope::Desktop => (HWND::default(), area.x, area.y),
    };
    let image = capture_region(
        handle,
        x,
        y,
        area.width,
        area.height,
        matches!(scope, Scope::Window { .. }),
    )
    .map_err(|_| "capture_failed")?;
    let jpeg = encode_jpeg(image).map_err(|_| "capture_failed")?;
    let digest = Sha256::digest(&jpeg).into();
    Ok((jpeg, digest))
}

struct Com;

impl Drop for Com {
    fn drop(&mut self) {
        unsafe { CoUninitialize() }
    }
}

pub fn nodes(surface: Surface) -> Vec<Node> {
    unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
            return vec![];
        }
        let _com = Com;
        collect_nodes(surface).unwrap_or_default()
    }
}

unsafe fn collect_nodes(surface: Surface) -> windows::core::Result<Vec<Node>> {
    let automation: IUIAutomation = CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)?;
    let timeouts = automation.cast::<IUIAutomation2>()?;
    timeouts.SetConnectionTimeout(200)?;
    timeouts.SetTransactionTimeout(200)?;
    let root = automation.ElementFromHandle(hwnd(surface.window))?;
    let walker = automation.ControlViewWalker()?;
    let mut pending = vec![(root, false)];
    let mut nodes = Vec::new();
    let deadline = Instant::now() + Duration::from_millis(850);
    for id in 0..64 {
        let Some((element, sibling)) = pending.pop() else {
            break;
        };
        if Instant::now() >= deadline {
            break;
        }
        if sibling {
            if let Ok(next) = walker.GetNextSiblingElement(&element) {
                pending.push((next, true));
            }
        }
        if let Ok(child) = walker.GetFirstChildElement(&element) {
            pending.push((child, true));
        }
        let Ok(rect) = element.CurrentBoundingRectangle() else {
            continue;
        };
        if rect.right <= rect.left
            || rect.bottom <= rect.top
            || element
                .CurrentIsOffscreen()
                .map_or(true, |value| value.as_bool())
            || element
                .CurrentIsEnabled()
                .map_or(true, |value| !value.as_bool())
        {
            continue;
        }
        let protected = element
            .CurrentIsPassword()
            .map_or(true, |value| value.as_bool());
        let name = if protected {
            String::new()
        } else {
            element
                .CurrentName()
                .unwrap_or_default()
                .to_string()
                .chars()
                .take(120)
                .collect()
        };
        let control_type = element.CurrentControlType().unwrap_or_default();
        let focused = element
            .CurrentHasKeyboardFocus()
            .is_ok_and(|value| value.as_bool());
        let value = if focused
            && !protected
            && (control_type == UIA_EditControlTypeId || control_type == UIA_DocumentControlTypeId)
        {
            let text = element
                .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
                .and_then(|pattern| pattern.DocumentRange())
                .and_then(|range| range.GetText(160))
                .or_else(|_| {
                    element
                        .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
                        .and_then(|pattern| pattern.CurrentValue())
                });
            text.ok()
                .map(|text| text.to_string().chars().take(160).collect())
        } else {
            None
        };
        nodes.push(Node {
            id,
            name,
            control_type: control_type.0,
            bounds: bounds(rect),
            focused,
            value,
        });
    }
    Ok(nodes)
}

fn contains(bounds: Bounds, point: POINT) -> bool {
    point.x >= bounds.x
        && point.x < bounds.x + bounds.width
        && point.y >= bounds.y
        && point.y < bounds.y + bounds.height
}

fn point(target: &Target, frame: &Frame) -> Result<POINT, &'static str> {
    let area = frame.surface.bounds;
    let point = match target {
        Target::Element { id } => {
            let bounds = frame
                .nodes
                .iter()
                .find(|node| node.id == *id)
                .ok_or("unknown_element")?
                .bounds;
            POINT {
                x: bounds.x + bounds.width / 2,
                y: bounds.y + bounds.height / 2,
            }
        }
        Target::Point { x, y } if (0.0..1.0).contains(x) && (0.0..1.0).contains(y) => POINT {
            x: area.x + (x * f64::from(area.width)).floor() as i32,
            y: area.y + (y * f64::from(area.height)).floor() as i32,
        },
        Target::Point { .. } => return Err("invalid_point"),
        Target::Visual { .. } => return Err("vision_unresolved"),
    };
    validate_point(point, frame)?;
    Ok(point)
}

fn validate_point(point: POINT, frame: &Frame) -> Result<(), &'static str> {
    let surface = frame.surface;
    unsafe {
        if !contains(surface.bounds, point)
            || MonitorFromPoint(point, MONITOR_DEFAULTTONULL).0.is_null()
        {
            return Err("point_outside_scope");
        }
        let root = GetAncestor(WindowFromPoint(point), GA_ROOT);
        let mut pid = 0;
        GetWindowThreadProcessId(root, Some(&mut pid));
        if pid == std::process::id() {
            return Err("client_control_surface");
        }
        if !frame.desktop_scope && root != hwnd(surface.window) {
            return Err("point_occluded");
        }
    }
    Ok(())
}

fn mouse(flags: MOUSE_EVENT_FLAGS, data: u32, dx: i32, dy: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: data,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}

fn move_to(point: POINT, desktop: Bounds) -> INPUT {
    fn absolute(offset: i32, size: i32) -> i32 {
        ((2 * i64::from(offset) + 1) * 65_536 / (2 * i64::from(size))) as i32
    }
    mouse(
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
        0,
        absolute(point.x - desktop.x, desktop.width),
        absolute(point.y - desktop.y, desktop.height),
    )
}

fn keyboard(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: scan,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}

fn key(value: &str) -> Result<u16, &'static str> {
    let upper = value.to_ascii_uppercase();
    let vk = match upper.as_str() {
        "CTRL" => VK_CONTROL,
        "SHIFT" => VK_SHIFT,
        "ALT" => VK_MENU,
        "WIN" => VK_LWIN,
        "ENTER" => VK_RETURN,
        "TAB" => VK_TAB,
        "ESC" => VK_ESCAPE,
        "BACKSPACE" => VK_BACK,
        "DELETE" => VK_DELETE,
        "SPACE" => VK_SPACE,
        "HOME" => VK_HOME,
        "END" => VK_END,
        "PAGEUP" => VK_PRIOR,
        "PAGEDOWN" => VK_NEXT,
        "LEFT" => VK_LEFT,
        "RIGHT" => VK_RIGHT,
        "UP" => VK_UP,
        "DOWN" => VK_DOWN,
        "INSERT" => VK_INSERT,
        _ => {
            let chars = upper.as_bytes();
            if chars.len() == 1 && chars[0].is_ascii_alphanumeric() {
                return Ok(u16::from(chars[0]));
            }
            let number = upper.strip_prefix('F').and_then(|v| v.parse::<u16>().ok());
            return number
                .filter(|v| (1..=24).contains(v))
                .map(|v| VK_F1.0 + v - 1)
                .ok_or("invalid_key");
        }
    };
    Ok(vk.0)
}

fn key_flags(vk: u16) -> KEYBD_EVENT_FLAGS {
    match VIRTUAL_KEY(vk) {
        VK_INSERT | VK_DELETE | VK_HOME | VK_END | VK_PRIOR | VK_NEXT | VK_LEFT | VK_UP
        | VK_RIGHT | VK_DOWN | VK_LWIN => KEYEVENTF_EXTENDEDKEY,
        _ => KEYBD_EVENT_FLAGS(0),
    }
}

pub(in super::super) fn perform(
    action: &Action,
    frame: &Frame,
    input_attempted: &mut bool,
) -> Result<(), &'static str> {
    let _dpi = Dpi::physical()?;
    let mut batch = Vec::new();
    let movement = |target| point(target, frame).map(|p| move_to(p, frame.surface.desktop));
    match action {
        Action::Click { target, button } => {
            let (down, up) = match button {
                Button::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                Button::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                Button::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            };
            batch.extend([movement(target)?, mouse(down, 0, 0, 0), mouse(up, 0, 0, 0)]);
        }
        Action::DoubleClick { target } => {
            batch.push(movement(target)?);
            for _ in 0..2 {
                batch.extend([
                    mouse(MOUSEEVENTF_LEFTDOWN, 0, 0, 0),
                    mouse(MOUSEEVENTF_LEFTUP, 0, 0, 0),
                ]);
            }
        }
        Action::Move { target } => batch.push(movement(target)?),
        Action::Scroll { target, ticks } if (-10..=10).contains(ticks) && *ticks != 0 => {
            batch.extend([
                movement(target)?,
                mouse(MOUSEEVENTF_WHEEL, (ticks * 120) as u32, 0, 0),
            ]);
        }
        Action::Drag { from, to } => {
            let start = point(from, frame)?;
            let end = point(to, frame)?;
            batch.extend([
                move_to(start, frame.surface.desktop),
                mouse(MOUSEEVENTF_LEFTDOWN, 0, 0, 0),
            ]);
            for step in 1..=12 {
                let point = POINT {
                    x: start.x + (end.x - start.x) * step / 12,
                    y: start.y + (end.y - start.y) * step / 12,
                };
                validate_point(point, frame)?;
                batch.push(move_to(point, frame.surface.desktop));
            }
            batch.push(mouse(MOUSEEVENTF_LEFTUP, 0, 0, 0));
        }
        Action::PressKey { key: value } => {
            let vk = key(value)?;
            batch.extend([
                keyboard(vk, 0, key_flags(vk)),
                keyboard(vk, 0, key_flags(vk) | KEYEVENTF_KEYUP),
            ]);
        }
        Action::Hotkey { keys } if (2..=4).contains(&keys.len()) => {
            let mut parsed = Vec::new();
            for value in keys {
                let vk = key(value)?;
                if parsed.contains(&vk) {
                    return Err("duplicate_key");
                }
                parsed.push(vk);
                batch.push(keyboard(vk, 0, key_flags(vk)));
            }
            for vk in parsed.into_iter().rev() {
                batch.push(keyboard(vk, 0, key_flags(vk) | KEYEVENTF_KEYUP));
            }
        }
        _ => return Err("invalid_action"),
    }
    send_batch(&batch, input_attempted)
}

pub fn type_scalar(units: &[u16], input_attempted: &mut bool) -> Result<(), &'static str> {
    let mut batch = Vec::with_capacity(4);
    for &unit in units {
        batch.extend([
            keyboard(0, unit, KEYEVENTF_UNICODE),
            keyboard(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
        ]);
    }
    send_batch(&batch, input_attempted)
}

fn send_batch(batch: &[INPUT], input_attempted: &mut bool) -> Result<(), &'static str> {
    if unsafe {
        [
            VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN, VK_LBUTTON, VK_RBUTTON, VK_MBUTTON,
        ]
        .iter()
        .any(|key| GetAsyncKeyState(i32::from(key.0)) < 0)
    } {
        return Err("input_held");
    }
    let size = std::mem::size_of::<INPUT>() as i32;
    let sent = unsafe { SendInput(batch, size) } as usize;
    *input_attempted |= sent > 0;
    if sent == batch.len() {
        return Ok(());
    }
    if sent > 0 {
        // Release keys and buttons that the partially submitted batch could have held.
        let release: Vec<_> = batch[sent..]
            .iter()
            .copied()
            .filter(|input| unsafe {
                if input.r#type == INPUT_KEYBOARD {
                    input.Anonymous.ki.dwFlags.contains(KEYEVENTF_KEYUP)
                } else {
                    let flags = input.Anonymous.mi.dwFlags;
                    flags == MOUSEEVENTF_LEFTUP
                        || flags == MOUSEEVENTF_RIGHTUP
                        || flags == MOUSEEVENTF_MIDDLEUP
                }
            })
            .collect();
        unsafe {
            SendInput(&release, size);
        }
    }
    Err("input_failed")
}

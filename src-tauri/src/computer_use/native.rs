#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

#[cfg(not(windows))]
mod unsupported {
    use super::super::*;

    pub fn windows() -> Result<Vec<WindowChoice>, &'static str> {
        Err("unsupported_platform")
    }
    pub fn unlocked() -> bool {
        false
    }
    pub fn valid_window(_: WindowId) -> bool {
        false
    }
    pub fn start_monitor() -> Result<(), &'static str> {
        Err("unsupported_platform")
    }
    pub fn arm_monitor(_: u64) {}
    pub fn activity() -> u64 {
        0
    }
    pub fn pause_toggle() -> u64 {
        0
    }
    pub fn emergency() -> u64 {
        0
    }
    pub fn surface(_: Scope) -> Result<Surface, &'static str> {
        Err("unsupported_platform")
    }
    pub fn capture(_: Scope, _: Surface) -> Result<(Vec<u8>, [u8; 32]), &'static str> {
        Err("unsupported_platform")
    }
    pub fn nodes(_: Surface) -> Vec<Node> {
        vec![]
    }
    pub fn type_scalar(_: &[u16], _: &mut bool) -> Result<(), &'static str> {
        Err("unsupported_platform")
    }
    pub(in super::super) fn perform(
        _: &Action,
        _: &Frame,
        _: &mut bool,
    ) -> Result<(), &'static str> {
        Err("unsupported_platform")
    }
}
#[cfg(not(windows))]
pub use unsupported::*;

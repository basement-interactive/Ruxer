// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::ScreenCaptureSourceDescriptor;

#[cfg(target_os = "windows")]
use std::ptr::null_mut;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, RECT},
    Graphics::Gdi::{EnumDisplayMonitors, HMONITOR},
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        EnumWindows, GW_OWNER, GWL_STYLE, GetWindow, GetWindowLongPtrW, GetWindowRect,
        GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, WS_CHILD,
    },
};

#[cfg(target_os = "windows")]
const MONITOR_SOURCE_LIMIT: usize = 16;

pub fn list_sources() -> Vec<ScreenCaptureSourceDescriptor> {
    #[cfg(target_os = "windows")]
    {
        let mut sources = enumerate_monitor_sources();
        sources.extend(enumerate_window_sources());
        sources
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn enumerate_monitor_sources() -> Vec<ScreenCaptureSourceDescriptor> {
    unsafe extern "system" fn enum_monitor(
        _monitor: HMONITOR,
        _hdc: windows_sys::Win32::Graphics::Gdi::HDC,
        rect: *mut RECT,
        param: LPARAM,
    ) -> i32 {
        let monitors = &mut *(param as *mut Vec<RECT>);
        if monitors.len() >= MONITOR_SOURCE_LIMIT {
            return 0;
        }
        if !rect.is_null() {
            monitors.push(*rect);
        }
        1
    }

    let mut monitors: Vec<RECT> = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            null_mut(),
            null_mut(),
            Some(enum_monitor),
            &mut monitors as *mut _ as LPARAM,
        );
    }
    assert!(
        monitors.len() <= MONITOR_SOURCE_LIMIT,
        "monitor source enumeration bounded"
    );

    monitors
        .into_iter()
        .enumerate()
        .map(|(index, rect)| {
            let width = (rect.right - rect.left).max(0) as u32;
            let height = (rect.bottom - rect.top).max(0) as u32;
            ScreenCaptureSourceDescriptor {
                kind: "screen".to_string(),
                id: format!("screen:{index}:0"),
                name: format!("Display {}", index + 1),
                width,
                height,
                target_pid: None,
            }
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn enumerate_window_sources() -> Vec<ScreenCaptureSourceDescriptor> {
    struct EnumState {
        own_pid: u32,
        sources: Vec<ScreenCaptureSourceDescriptor>,
    }

    unsafe extern "system" fn enum_window(hwnd: HWND, param: LPARAM) -> i32 {
        let state = &mut *(param as *mut EnumState);
        if let Some(source) = describe_window_source(hwnd, state.own_pid) {
            state.sources.push(source);
        }
        1
    }

    let mut state = EnumState {
        own_pid: unsafe { GetCurrentProcessId() },
        sources: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(enum_window), &mut state as *mut _ as LPARAM);
    }
    state.sources
}

#[cfg(target_os = "windows")]
fn describe_window_source(hwnd: HWND, own_pid: u32) -> Option<ScreenCaptureSourceDescriptor> {
    if hwnd.is_null() || unsafe { IsWindowVisible(hwnd) } == 0 {
        return None;
    }
    if !unsafe { GetWindow(hwnd, GW_OWNER) }.is_null() {
        return None;
    }
    let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) } as u32;
    if style & WS_CHILD != 0 {
        return None;
    }

    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    if pid == 0 || pid == own_pid {
        return None;
    }

    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
        return None;
    }
    let width = (rect.right - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top).max(0) as u32;
    if width == 0 || height == 0 {
        return None;
    }

    let title = window_title(hwnd).unwrap_or_else(|| format!("Window {pid}"));
    Some(ScreenCaptureSourceDescriptor {
        kind: "window".to_string(),
        id: format!("window:{}:0", hwnd as usize),
        name: title,
        width,
        height,
        target_pid: Some(pid),
    })
}

#[cfg(target_os = "windows")]
fn window_title(hwnd: HWND) -> Option<String> {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 {
        return None;
    }
    let mut buf = vec![0u16; (len + 1) as usize];
    let copied = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if copied <= 0 {
        return None;
    }
    let title = String::from_utf16_lossy(&buf[..copied as usize])
        .trim()
        .to_string();
    if title.is_empty() { None } else { Some(title) }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(target_os = "windows")]
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

#[cfg(target_os = "windows")]
use windows::{
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::{
            LibraryLoader::{GetProcAddress, LoadLibraryW},
            Threading::{
                GetCurrentProcess, OpenProcess, PROCESS_QUERY_INFORMATION,
                PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION,
            },
        },
    },
    core::{s, w},
};

#[cfg(target_os = "windows")]
const D3DKMT_SCHEDULINGPRIORITYCLASS_NORMAL: u32 = 2;
#[cfg(target_os = "windows")]
const D3DKMT_SCHEDULINGPRIORITYCLASS_HIGH: u32 = 4;
#[cfg(target_os = "windows")]
const D3DKMT_SCHEDULINGPRIORITYCLASS_REALTIME: u32 = 5;

#[cfg(target_os = "windows")]
static SAVED_PRIORITIES: LazyLock<Mutex<HashMap<u32, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[cfg(target_os = "windows")]
type SetSchedulingPriorityClassFn = unsafe extern "system" fn(HANDLE, u32) -> i32;
#[cfg(target_os = "windows")]
type GetSchedulingPriorityClassFn = unsafe extern "system" fn(HANDLE, *mut u32) -> i32;

#[cfg(target_os = "windows")]
struct D3dkmtFns {
    set: SetSchedulingPriorityClassFn,
    get: GetSchedulingPriorityClassFn,
}

#[cfg(target_os = "windows")]
fn load_d3dkmt_fns() -> Result<D3dkmtFns, String> {
    unsafe {
        let gdi32 =
            LoadLibraryW(w!("gdi32.dll")).map_err(|e| format!("LoadLibraryW(gdi32.dll): {e}"))?;
        let set_ptr = GetProcAddress(gdi32, s!("D3DKMTSetProcessSchedulingPriorityClass"))
            .ok_or("D3DKMTSetProcessSchedulingPriorityClass not exported by gdi32.dll")?;
        let get_ptr = GetProcAddress(gdi32, s!("D3DKMTGetProcessSchedulingPriorityClass"))
            .ok_or("D3DKMTGetProcessSchedulingPriorityClass not exported by gdi32.dll")?;
        Ok(D3dkmtFns {
            set: std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                SetSchedulingPriorityClassFn,
            >(set_ptr),
            get: std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                GetSchedulingPriorityClassFn,
            >(get_ptr),
        })
    }
}

#[cfg(target_os = "windows")]
fn process_id_or_current(process_id: Option<u32>) -> Result<u32, String> {
    let pid = process_id.unwrap_or_else(std::process::id);
    if pid == 0 {
        return Err("Invalid process id 0".into());
    }
    Ok(pid)
}

#[cfg(target_os = "windows")]
fn with_process_handle<T>(
    process_id: u32,
    operation: impl FnOnce(HANDLE) -> Result<T, String>,
) -> Result<T, String> {
    if process_id == std::process::id() {
        return operation(unsafe { GetCurrentProcess() });
    }

    let access =
        PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION;
    let handle = unsafe { OpenProcess(access, false, process_id) }
        .map_err(|e| format!("OpenProcess({process_id}): {e}"))?;
    let result = operation(handle);
    let _ = unsafe { CloseHandle(handle) };
    result
}

#[cfg(target_os = "windows")]
fn scheduling_priority_class(
    priority_class: Option<String>,
) -> Result<(u32, &'static str), String> {
    match priority_class
        .as_deref()
        .unwrap_or("high")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "" | "high" => Ok((D3DKMT_SCHEDULINGPRIORITYCLASS_HIGH, "HIGH")),
        "realtime" | "real-time" => Ok((D3DKMT_SCHEDULINGPRIORITYCLASS_REALTIME, "REALTIME")),
        other => Err(format!(
            "Unsupported GPU scheduling priority class '{other}'; expected 'high' or 'realtime'"
        )),
    }
}

#[cfg(target_os = "windows")]
pub fn elevate(process_id: Option<u32>, priority_class: Option<String>) -> Result<(), String> {
    let fns = load_d3dkmt_fns()?;
    let process_id = process_id_or_current(process_id)?;
    let (priority_class, priority_label) = scheduling_priority_class(priority_class)?;

    with_process_handle(process_id, |process| {
        let mut current: u32 = D3DKMT_SCHEDULINGPRIORITYCLASS_NORMAL;
        let status = unsafe { (fns.get)(process, &mut current) };
        if status == 0 {
            let mut saved = SAVED_PRIORITIES
                .lock()
                .map_err(|_| "GPU priority saved-state lock poisoned".to_string())?;
            saved.entry(process_id).or_insert(current);
        }

        let status = unsafe { (fns.set)(process, priority_class) };
        if status != 0 {
            return Err(format!(
                "D3DKMTSetProcessSchedulingPriorityClass(pid={process_id}, {priority_label}) returned NTSTATUS 0x{:08X}",
                status as u32
            ));
        }
        Ok(())
    })
}

#[cfg(target_os = "windows")]
pub fn restore(process_id: Option<u32>) -> Result<(), String> {
    let fns = load_d3dkmt_fns()?;
    let process_id = process_id_or_current(process_id)?;
    let target = {
        let mut saved = SAVED_PRIORITIES
            .lock()
            .map_err(|_| "GPU priority saved-state lock poisoned".to_string())?;
        saved
            .remove(&process_id)
            .unwrap_or(D3DKMT_SCHEDULINGPRIORITYCLASS_NORMAL)
    };

    with_process_handle(process_id, |process| {
        let status = unsafe { (fns.set)(process, target) };
        if status != 0 {
            return Err(format!(
                "D3DKMTSetProcessSchedulingPriorityClass(pid={process_id}, restore={target}) returned NTSTATUS 0x{:08X}",
                status as u32
            ));
        }
        Ok(())
    })
}

#[cfg(not(target_os = "windows"))]
pub fn elevate(_process_id: Option<u32>, _priority_class: Option<String>) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn restore(_process_id: Option<u32>) -> Result<(), String> {
    Ok(())
}

// SPDX-License-Identifier: AGPL-3.0-or-later

#![deny(clippy::all)]

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("fluxer-inject-helper is only supported on Windows");
    std::process::exit(Stage::Unsupported as i32);
}

#[repr(i32)]
#[derive(Clone, Copy)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
enum Stage {
    Success = 0,
    BadArgs = 2,
    HookMissing = 3,
    OpenProcess = 4,
    Alloc = 5,
    Write = 6,
    Kernel32 = 7,
    LoadLibraryAddr = 8,
    CreateThread = 9,
    WaitTimeout = 10,
    LoadLibraryFailed = 11,
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    Unsupported = 64,
}

#[cfg(target_os = "windows")]
fn main() {
    let code = win::run();
    std::process::exit(code as i32);
}

#[cfg(target_os = "windows")]
mod win {
    use super::Stage;
    use core::ffi::c_void;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, HANDLE, INVALID_HANDLE_VALUE, WAIT_ABANDONED, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::System::Diagnostics::Debug::{OutputDebugStringW, WriteProcessMemory};
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    use windows_sys::Win32::System::Memory::{
        MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE, VirtualAllocEx, VirtualFreeEx,
    };
    use windows_sys::Win32::System::Threading::{
        CreateRemoteThread, GetExitCodeThread, INFINITE, OpenProcess, PROCESS_CREATE_THREAD,
        PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ, PROCESS_VM_WRITE,
        WaitForSingleObject,
    };

    const DEFAULT_TIMEOUT_MS: u32 = 10_000;

    struct OwnedHandle(HANDLE);

    impl OwnedHandle {
        fn raw(&self) -> HANDLE {
            self.0
        }
    }

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
    }

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn log(message: &str) {
        let text = format!("[fluxer-inject-helper] {message}");
        let wide = to_wide(&text);
        unsafe {
            OutputDebugStringW(wide.as_ptr());
        }
        eprintln!("{text}");
    }

    fn fail(stage: Stage, context: &str) -> Stage {
        let err = unsafe { GetLastError() };
        log(&format!(
            "FAILED stage={} ({context}); GetLastError={err}",
            stage as i32
        ));
        stage
    }

    pub(super) fn run() -> Stage {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.len() < 2 || args.len() > 3 {
            log(&format!(
                "bad args: expected <pid> <hook-dll-path> [timeout-ms], got {} arg(s)",
                args.len()
            ));
            return Stage::BadArgs;
        }
        let Ok(target_pid) = args[0].parse::<u32>() else {
            log(&format!("bad args: unparseable pid {:?}", args[0]));
            return Stage::BadArgs;
        };
        if target_pid == 0 {
            log("bad args: pid must be non-zero");
            return Stage::BadArgs;
        }
        let hook_path = args[1].as_str();
        let timeout_ms = match args.get(2) {
            None => DEFAULT_TIMEOUT_MS,
            Some(raw) => match raw.parse::<u32>() {
                Ok(0) => INFINITE,
                Ok(value) => value,
                Err(_) => {
                    log(&format!("bad args: unparseable timeout {raw:?}"));
                    return Stage::BadArgs;
                }
            },
        };

        if !std::path::Path::new(hook_path).exists() {
            log(&format!("hook DLL missing: {hook_path}"));
            return Stage::HookMissing;
        }

        log(&format!(
            "injecting (pid={target_pid}, hook={hook_path}, timeout_ms={timeout_ms}, \
             helper_bits={})",
            usize::BITS
        ));

        inject(target_pid, hook_path, timeout_ms)
    }

    fn inject(target_pid: u32, hook_path: &str, timeout_ms: u32) -> Stage {
        let wide_path = to_wide(hook_path);
        let path_bytes = wide_path.len() * std::mem::size_of::<u16>();

        unsafe {
            let process = OpenProcess(
                PROCESS_CREATE_THREAD
                    | PROCESS_VM_OPERATION
                    | PROCESS_VM_WRITE
                    | PROCESS_VM_READ
                    | PROCESS_QUERY_INFORMATION,
                0,
                target_pid,
            );
            if process.is_null() {
                return fail(Stage::OpenProcess, "OpenProcess returned null");
            }
            let process = OwnedHandle(process);

            let remote_path = VirtualAllocEx(
                process.raw(),
                null(),
                path_bytes,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_READWRITE,
            );
            if remote_path.is_null() {
                return fail(Stage::Alloc, "VirtualAllocEx returned null");
            }

            let mut written: usize = 0;
            let write_ok = WriteProcessMemory(
                process.raw(),
                remote_path,
                wide_path.as_ptr().cast(),
                path_bytes,
                &mut written,
            ) != 0;
            if !write_ok || written != path_bytes {
                let stage = fail(Stage::Write, "WriteProcessMemory failed/short");
                VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);
                return stage;
            }

            let kernel32_name = to_wide("kernel32.dll");
            let kernel32 = GetModuleHandleW(kernel32_name.as_ptr());
            if kernel32.is_null() {
                let stage = fail(Stage::Kernel32, "GetModuleHandleW(kernel32.dll)");
                VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);
                return stage;
            }
            let load_library = GetProcAddress(kernel32, c"LoadLibraryW".as_ptr().cast());
            let Some(load_library) = load_library else {
                let stage = fail(Stage::LoadLibraryAddr, "GetProcAddress(LoadLibraryW)");
                VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);
                return stage;
            };
            let start_routine: unsafe extern "system" fn(*mut c_void) -> u32 =
                std::mem::transmute(load_library);

            let thread = CreateRemoteThread(
                process.raw(),
                null(),
                0,
                Some(start_routine),
                remote_path,
                0,
                null_mut(),
            );
            if thread.is_null() {
                let stage = fail(Stage::CreateThread, "CreateRemoteThread returned null");
                VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);
                return stage;
            }
            let thread = OwnedHandle(thread);

            let wait = WaitForSingleObject(thread.raw(), timeout_ms);
            if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
                let stage = fail(Stage::WaitTimeout, "WaitForSingleObject did not signal");
                VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);
                return stage;
            }

            let mut exit_code: u32 = 0;
            let got_exit = GetExitCodeThread(thread.raw(), &mut exit_code) != 0;
            VirtualFreeEx(process.raw(), remote_path, 0, MEM_RELEASE);

            if !got_exit {
                return fail(Stage::LoadLibraryFailed, "GetExitCodeThread failed");
            }
            if exit_code == 0 {
                log("remote LoadLibraryW returned NULL -- DLL failed to load in target");
                return Stage::LoadLibraryFailed;
            }

            log(&format!(
                "injection succeeded (remote LoadLibraryW HMODULE low bits={exit_code:#010x})"
            ));
            Stage::Success
        }
    }
}

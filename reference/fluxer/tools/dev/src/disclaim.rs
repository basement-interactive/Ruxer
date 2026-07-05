// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::{Context, Result, bail};
use std::ffi::CString;

pub fn exec_disclaimed(program: &str, args: &[String]) -> Result<()> {
    let program_c = CString::new(program).context("program path contains a NUL byte")?;
    let mut argv = Vec::with_capacity(args.len() + 1);
    argv.push(program_c.clone());
    for arg in args {
        argv.push(CString::new(arg.as_str()).context("argument contains a NUL byte")?);
    }
    exec_disclaimed_impl(&program_c, &argv)
}

#[cfg(target_os = "macos")]
fn exec_disclaimed_impl(program: &CString, argv: &[CString]) -> Result<()> {
    use std::ptr;

    unsafe extern "C" {
        fn responsibility_spawnattrs_setdisclaim(
            attrs: *mut libc::posix_spawnattr_t,
            disclaim: libc::c_int,
        ) -> libc::c_int;
    }

    let mut argv_ptrs: Vec<*mut libc::c_char> =
        argv.iter().map(|arg| arg.as_ptr().cast_mut()).collect();
    argv_ptrs.push(ptr::null_mut());

    unsafe {
        let mut attrs: libc::posix_spawnattr_t = ptr::null_mut();
        let rc = libc::posix_spawnattr_init(&mut attrs);
        if rc != 0 {
            bail!(
                "posix_spawnattr_init failed: {}",
                std::io::Error::from_raw_os_error(rc)
            );
        }
        let rc =
            libc::posix_spawnattr_setflags(&mut attrs, libc::POSIX_SPAWN_SETEXEC as libc::c_short);
        if rc != 0 {
            libc::posix_spawnattr_destroy(&mut attrs);
            bail!(
                "posix_spawnattr_setflags failed: {}",
                std::io::Error::from_raw_os_error(rc)
            );
        }
        let rc = responsibility_spawnattrs_setdisclaim(&mut attrs, 1);
        if rc != 0 {
            libc::posix_spawnattr_destroy(&mut attrs);
            bail!(
                "responsibility_spawnattrs_setdisclaim failed: {}",
                std::io::Error::from_raw_os_error(rc)
            );
        }
        let mut pid: libc::pid_t = 0;
        let rc = libc::posix_spawn(
            &mut pid,
            program.as_ptr(),
            ptr::null(),
            &attrs,
            argv_ptrs.as_ptr(),
            *libc::_NSGetEnviron(),
        );
        libc::posix_spawnattr_destroy(&mut attrs);
        bail!(
            "posix_spawn(SETEXEC) failed for {}: {}",
            program.to_string_lossy(),
            std::io::Error::from_raw_os_error(rc)
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn exec_disclaimed_impl(program: &CString, _argv: &[CString]) -> Result<()> {
    bail!(
        "exec-disclaimed is only supported on macOS (requested program: {})",
        program.to_string_lossy()
    );
}

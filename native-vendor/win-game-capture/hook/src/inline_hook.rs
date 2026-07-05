// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

#[cfg(not(target_arch = "aarch64"))]
use retour::Function;

#[cfg(target_arch = "aarch64")]
pub(crate) use aarch64_function::Function;

#[cfg(target_arch = "aarch64")]
mod aarch64_function {
    pub(crate) trait Function: Copy + Sync + 'static {
        unsafe fn from_ptr(ptr: *const ()) -> Self;
        fn to_ptr(&self) -> *const ();
    }

    macro_rules! impl_function {
        ($($arg:ident),*) => {
            impl<Ret: 'static, $($arg: 'static),*> Function
                for unsafe extern "system" fn($($arg),*) -> Ret
            {
                unsafe fn from_ptr(ptr: *const ()) -> Self {
                    core::mem::transmute(ptr)
                }
                fn to_ptr(&self) -> *const () {
                    *self as *const ()
                }
            }
        };
    }

    impl_function!();
    impl_function!(A);
    impl_function!(A, B);
    impl_function!(A, B, C);
    impl_function!(A, B, C, D);
    impl_function!(A, B, C, D, E);
    impl_function!(A, B, C, D, E, F);
}

pub(crate) struct Detour<T: Function> {
    inner: Inner<T>,
}

#[cfg(not(target_arch = "aarch64"))]
enum Inner<T: Function> {
    Retour(retour::GenericDetour<T>),
}

#[cfg(target_arch = "aarch64")]
enum Inner<T: Function> {
    Aarch64(aarch64::Aarch64Detour<T>),
}

impl<T: Function> Detour<T> {
    pub(crate) unsafe fn new(target: T, detour: T) -> Result<Self, ()> {
        #[cfg(not(target_arch = "aarch64"))]
        {
            match retour::GenericDetour::<T>::new(target, detour) {
                Ok(detour) => Ok(Self {
                    inner: Inner::Retour(detour),
                }),
                Err(_) => Err(()),
            }
        }
        #[cfg(target_arch = "aarch64")]
        {
            aarch64::Aarch64Detour::<T>::new(target, detour).map(|detour| Self {
                inner: Inner::Aarch64(detour),
            })
        }
    }

    pub(crate) unsafe fn enable(&self) -> Result<(), ()> {
        match &self.inner {
            #[cfg(not(target_arch = "aarch64"))]
            Inner::Retour(detour) => detour.enable().map_err(|_| ()),
            #[cfg(target_arch = "aarch64")]
            Inner::Aarch64(detour) => detour.enable(),
        }
    }

    pub(crate) fn trampoline_fn(&self) -> T {
        match &self.inner {
            #[cfg(not(target_arch = "aarch64"))]
            Inner::Retour(detour) => unsafe {
                T::from_ptr(detour.trampoline() as *const () as *const ())
            },
            #[cfg(target_arch = "aarch64")]
            Inner::Aarch64(detour) => detour.trampoline_fn(),
        }
    }
}

#[cfg(target_arch = "aarch64")]
mod aarch64 {

    use super::Function;
    use crate::arm64_reloc::{
        NOP, STOLEN_BYTES, append_abs_branch, assemble_trampoline, import_thunk_target,
    };
    use core::marker::PhantomData;
    use std::ptr;
    use windows_sys::Win32::System::{
        Diagnostics::Debug::FlushInstructionCache,
        Memory::{
            MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_EXECUTE_READ, PAGE_EXECUTE_READWRITE,
            PAGE_PROTECTION_FLAGS, VirtualAlloc, VirtualFree, VirtualProtect,
        },
        Threading::GetCurrentProcess,
    };

    const TRAMPOLINE_CAP: usize = 256;

    pub(super) struct Aarch64Detour<T: Function> {
        target: *mut u8,
        detour: *const u8,
        trampoline: *mut u8,
        original_prologue: [u8; STOLEN_BYTES],
        enabled: std::cell::Cell<bool>,
        _marker: PhantomData<T>,
    }

    unsafe impl<T: Function> Send for Aarch64Detour<T> {}
    unsafe impl<T: Function> Sync for Aarch64Detour<T> {}

    impl<T: Function> Aarch64Detour<T> {
        pub(super) unsafe fn new(target: T, detour: T) -> Result<Self, ()> {
            let target_ptr = target.to_ptr() as *mut u8;
            let detour_ptr = detour.to_ptr() as *const u8;
            if target_ptr.is_null() || detour_ptr.is_null() {
                return Err(());
            }

            let mut original = [0u8; STOLEN_BYTES];
            ptr::copy_nonoverlapping(target_ptr, original.as_mut_ptr(), STOLEN_BYTES);

            let trampoline = VirtualAlloc(
                ptr::null(),
                TRAMPOLINE_CAP,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE,
            ) as *mut u8;
            if trampoline.is_null() {
                return Err(());
            }

            let trampoline_addr = trampoline as u64;
            let resume = target_ptr as u64 + STOLEN_BYTES as u64;
            let body =
                match assemble_trampoline(&original, target_ptr as u64, trampoline_addr, resume) {
                    Some(body) => body,
                    None => match import_thunk_target(&original, target_ptr as u64) {
                        Some(target) => {
                            let mut body = Vec::new();
                            append_abs_branch(&mut body, target, false);
                            body
                        }
                        None => {
                            VirtualFree(trampoline.cast(), 0, MEM_RELEASE);
                            return Err(());
                        }
                    },
                };
            if body.len() > TRAMPOLINE_CAP {
                VirtualFree(trampoline.cast(), 0, MEM_RELEASE);
                return Err(());
            }
            ptr::copy_nonoverlapping(body.as_ptr(), trampoline, body.len());

            let mut old = 0 as PAGE_PROTECTION_FLAGS;
            VirtualProtect(
                trampoline.cast(),
                TRAMPOLINE_CAP,
                PAGE_EXECUTE_READ,
                &mut old,
            );
            FlushInstructionCache(GetCurrentProcess(), trampoline.cast(), TRAMPOLINE_CAP);

            Ok(Self {
                target: target_ptr,
                detour: detour_ptr,
                trampoline,
                original_prologue: original,
                enabled: std::cell::Cell::new(false),
                _marker: PhantomData,
            })
        }

        pub(super) unsafe fn enable(&self) -> Result<(), ()> {
            if self.enabled.get() {
                return Ok(());
            }
            let mut patch = Vec::new();
            append_abs_branch(&mut patch, self.detour as u64, false);
            if patch.len() > STOLEN_BYTES {
                return Err(());
            }
            while patch.len() < STOLEN_BYTES {
                patch.extend_from_slice(&NOP.to_le_bytes());
            }

            let mut old = 0 as PAGE_PROTECTION_FLAGS;
            if VirtualProtect(
                self.target.cast(),
                STOLEN_BYTES,
                PAGE_EXECUTE_READWRITE,
                &mut old,
            ) == 0
            {
                return Err(());
            }
            ptr::copy_nonoverlapping(patch.as_ptr(), self.target, STOLEN_BYTES);
            let mut restore = 0 as PAGE_PROTECTION_FLAGS;
            VirtualProtect(self.target.cast(), STOLEN_BYTES, old, &mut restore);
            FlushInstructionCache(GetCurrentProcess(), self.target.cast(), STOLEN_BYTES);
            self.enabled.set(true);
            Ok(())
        }

        unsafe fn disable(&self) {
            if !self.enabled.get() {
                return;
            }
            let mut old = 0 as PAGE_PROTECTION_FLAGS;
            if VirtualProtect(
                self.target.cast(),
                STOLEN_BYTES,
                PAGE_EXECUTE_READWRITE,
                &mut old,
            ) != 0
            {
                ptr::copy_nonoverlapping(
                    self.original_prologue.as_ptr(),
                    self.target,
                    STOLEN_BYTES,
                );
                let mut restore = 0 as PAGE_PROTECTION_FLAGS;
                VirtualProtect(self.target.cast(), STOLEN_BYTES, old, &mut restore);
                FlushInstructionCache(GetCurrentProcess(), self.target.cast(), STOLEN_BYTES);
            }
            self.enabled.set(false);
        }

        pub(super) fn trampoline_fn(&self) -> T {
            unsafe { T::from_ptr(self.trampoline as *const ()) }
        }
    }

    impl<T: Function> Drop for Aarch64Detour<T> {
        fn drop(&mut self) {
            unsafe {
                self.disable();
                if !self.trampoline.is_null() {
                    VirtualFree(self.trampoline.cast(), 0, MEM_RELEASE);
                    self.trampoline = ptr::null_mut();
                }
            }
        }
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

use core::ffi::c_void;
use core::ptr::NonNull;

use crate::backend::BackendError;

type IoSurfaceRef = *mut c_void;
type CfDictionaryRef = *const c_void;
type CfStringRef = *const c_void;
type CfNumberRef = *const c_void;
type CfAllocatorRef = *const c_void;

const KIO_RETURN_SUCCESS: i32 = 0;
const KCF_NUMBER_SINT32_TYPE: i32 = 3;

const IOSURFACE_PIXEL_FORMAT_420V: u32 = u32::from_be_bytes(*b"420v");

#[link(name = "IOSurface", kind = "framework")]
unsafe extern "C" {
    fn IOSurfaceCreate(properties: CfDictionaryRef) -> IoSurfaceRef;
    fn IOSurfaceLock(buffer: IoSurfaceRef, options: u32, seed: *mut u32) -> i32;
    fn IOSurfaceUnlock(buffer: IoSurfaceRef, options: u32, seed: *mut u32) -> i32;
    fn IOSurfaceGetID(buffer: IoSurfaceRef) -> u32;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    static kCFAllocatorDefault: CfAllocatorRef;
    static kCFTypeDictionaryKeyCallBacks: *const c_void;
    static kCFTypeDictionaryValueCallBacks: *const c_void;
    fn CFDictionaryCreate(
        allocator: CfAllocatorRef,
        keys: *const *const c_void,
        values: *const *const c_void,
        num_values: isize,
        key_callbacks: *const c_void,
        value_callbacks: *const c_void,
    ) -> CfDictionaryRef;
    fn CFNumberCreate(
        allocator: CfAllocatorRef,
        the_type: i32,
        value_ptr: *const c_void,
    ) -> CfNumberRef;
    fn CFStringCreateWithCString(
        allocator: CfAllocatorRef,
        c_str: *const i8,
        encoding: u32,
    ) -> CfStringRef;
    fn CFRelease(cf: *const c_void);
}

const KCFSTRING_ENCODING_UTF8: u32 = 0x0800_0100;

fn cf_str(literal: &'static str) -> CfStringRef {
    assert!(literal.ends_with('\0'), "literal must be nul-terminated");
    let bytes = literal.as_bytes();
    unsafe {
        CFStringCreateWithCString(
            kCFAllocatorDefault,
            bytes.as_ptr() as *const i8,
            KCFSTRING_ENCODING_UTF8,
        )
    }
}

fn cf_num_i32(v: i32) -> CfNumberRef {
    let ptr: *const i32 = &v;
    unsafe {
        CFNumberCreate(
            kCFAllocatorDefault,
            KCF_NUMBER_SINT32_TYPE,
            ptr as *const c_void,
        )
    }
}

pub struct OwnedIoSurface {
    surface: NonNull<c_void>,
}

unsafe impl Send for OwnedIoSurface {}

impl OwnedIoSurface {
    pub fn create_nv12(width: u32, height: u32) -> Result<Self, BackendError> {
        assert!(width > 0, "create_nv12 width positive");
        assert!(
            height > 0 && height.is_multiple_of(2),
            "create_nv12 height positive and even"
        );
        let width_key = cf_str("IOSurfaceWidth\0");
        let height_key = cf_str("IOSurfaceHeight\0");
        let pf_key = cf_str("IOSurfacePixelFormat\0");
        let bpe_key = cf_str("IOSurfaceBytesPerElement\0");
        let width_val = cf_num_i32(width as i32);
        let height_val = cf_num_i32(height as i32);
        let pf_val = cf_num_i32(IOSURFACE_PIXEL_FORMAT_420V as i32);
        let bpe_val = cf_num_i32(1);
        let keys: [*const c_void; 4] = [width_key, height_key, pf_key, bpe_key];
        let vals: [*const c_void; 4] = [width_val, height_val, pf_val, bpe_val];
        let dict = unsafe {
            CFDictionaryCreate(
                kCFAllocatorDefault,
                keys.as_ptr(),
                vals.as_ptr(),
                4,
                kCFTypeDictionaryKeyCallBacks,
                kCFTypeDictionaryValueCallBacks,
            )
        };
        let raw = if dict.is_null() {
            core::ptr::null_mut()
        } else {
            unsafe { IOSurfaceCreate(dict) }
        };
        unsafe {
            CFRelease(width_key);
            CFRelease(height_key);
            CFRelease(pf_key);
            CFRelease(bpe_key);
            CFRelease(width_val);
            CFRelease(height_val);
            CFRelease(pf_val);
            CFRelease(bpe_val);
            if !dict.is_null() {
                CFRelease(dict);
            }
        }
        let surface = NonNull::new(raw).ok_or(BackendError::PlatformUnsupported {
            reason: "IOSurfaceCreate returned null",
        })?;
        assert!(
            unsafe { IOSurfaceGetID(surface.as_ptr()) } != 0,
            "IOSurfaceGetID non-zero"
        );
        Ok(Self { surface })
    }

    pub fn handle(&self) -> u64 {
        let id = unsafe { IOSurfaceGetID(self.surface.as_ptr()) };
        assert!(id != 0, "IOSurfaceID non-zero on handle()");
        assert!(self.surface.as_ptr() as usize != 0, "surface ptr non-null");
        id as u64
    }

    pub fn as_ptr(&self) -> *mut c_void {
        let p = self.surface.as_ptr();
        assert!(!p.is_null(), "IOSurface raw pointer non-null");
        assert!(unsafe { IOSurfaceGetID(p) } != 0, "IOSurfaceID non-zero");
        p
    }

    pub fn lock_for_writing(&mut self) -> Result<(), BackendError> {
        let mut seed: u32 = 0;
        let status = unsafe { IOSurfaceLock(self.surface.as_ptr(), 0, &mut seed) };
        if status != KIO_RETURN_SUCCESS {
            return Err(BackendError::PlatformUnsupported {
                reason: "IOSurfaceLock failed",
            });
        }
        assert_eq!(status, KIO_RETURN_SUCCESS, "lock status ok");
        assert!(seed < u32::MAX, "lock seed within range");
        Ok(())
    }

    pub fn unlock_after_writing(&mut self) -> Result<(), BackendError> {
        let mut seed: u32 = 0;
        let status = unsafe { IOSurfaceUnlock(self.surface.as_ptr(), 0, &mut seed) };
        if status != KIO_RETURN_SUCCESS {
            return Err(BackendError::PlatformUnsupported {
                reason: "IOSurfaceUnlock failed",
            });
        }
        assert_eq!(status, KIO_RETURN_SUCCESS, "unlock status ok");
        assert!(seed < u32::MAX, "unlock seed within range");
        Ok(())
    }
}

impl Drop for OwnedIoSurface {
    fn drop(&mut self) {
        let ptr = self.surface.as_ptr();
        if !ptr.is_null() {
            unsafe { CFRelease(ptr) };
        }
    }
}

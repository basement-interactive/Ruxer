// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::{
    GAME_CAPTURE_API_OPENGL, GAME_CAPTURE_FALLBACK_NONE,
    GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED, HookState, mark_present,
    publish_shared_texture_frame, set_capture_flags, set_fallback_reason, verbose_log,
};
use std::{
    ffi::c_void,
    ptr::null_mut,
    sync::atomic::{AtomicBool, Ordering},
};
use windows::{
    Win32::{
        Foundation::{HMODULE as WinHmodule, HWND as WinHwnd},
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_RESOURCE_MISC_SHARED, D3D11_SDK_VERSION,
                D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11CreateDeviceAndSwapChain,
                ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
            },
            Dxgi::{
                Common::{
                    DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_MODE_DESC,
                    DXGI_MODE_SCALING_UNSPECIFIED, DXGI_MODE_SCANLINE_ORDER_UNSPECIFIED,
                    DXGI_RATIONAL, DXGI_SAMPLE_DESC,
                },
                DXGI_PRESENT, DXGI_SWAP_CHAIN_DESC, DXGI_SWAP_EFFECT_DISCARD,
                DXGI_USAGE_RENDER_TARGET_OUTPUT, IDXGIResource, IDXGISwapChain,
            },
        },
    },
    core::{BOOL as WinBool, Interface},
};
use windows_sys::Win32::{
    Foundation::HWND as SysHwnd,
    Graphics::OpenGL::{
        GL_COLOR_BUFFER_BIT, GL_LINEAR, GL_NEAREST, GL_NO_ERROR, GL_TEXTURE_2D,
        GL_TEXTURE_BINDING_2D, glBindTexture, glDeleteTextures, glFinish, glGenTextures,
        glGetError, glGetIntegerv, wglGetCurrentContext, wglGetProcAddress,
    },
    UI::WindowsAndMessaging::DestroyWindow,
};

const WGL_ACCESS_READ_ONLY_NV: u32 = 0x0000;
const WGL_ACCESS_READ_WRITE_NV: u32 = 0x0001;
const WGL_ACCESS_WRITE_DISCARD_NV: u32 = 0x0002;

const GL_READ_FRAMEBUFFER: u32 = 0x8CA8;
const GL_DRAW_FRAMEBUFFER: u32 = 0x8CA9;
const GL_FRAMEBUFFER: u32 = 0x8D40;
const GL_COLOR_ATTACHMENT0: u32 = 0x8CE0;
const GL_FRAMEBUFFER_COMPLETE: u32 = 0x8CD5;
const GL_READ_FRAMEBUFFER_BINDING: u32 = 0x8CAA;
const GL_DRAW_FRAMEBUFFER_BINDING: u32 = 0x8CA6;

type DxOpenDeviceNvFn = unsafe extern "system" fn(dx_device: *mut c_void) -> *mut c_void;
type DxCloseDeviceNvFn = unsafe extern "system" fn(device: *mut c_void) -> i32;
type DxRegisterObjectNvFn = unsafe extern "system" fn(
    device: *mut c_void,
    dx_object: *mut c_void,
    name: u32,
    object_type: u32,
    access: u32,
) -> *mut c_void;
type DxUnregisterObjectNvFn =
    unsafe extern "system" fn(device: *mut c_void, object: *mut c_void) -> i32;
type DxLockObjectsNvFn =
    unsafe extern "system" fn(device: *mut c_void, count: i32, objects: *const *mut c_void) -> i32;
type DxUnlockObjectsNvFn =
    unsafe extern "system" fn(device: *mut c_void, count: i32, objects: *const *mut c_void) -> i32;

type GlGenFramebuffersFn = unsafe extern "system" fn(n: i32, framebuffers: *mut u32);
type GlDeleteFramebuffersFn = unsafe extern "system" fn(n: i32, framebuffers: *const u32);
type GlBindFramebufferFn = unsafe extern "system" fn(target: u32, framebuffer: u32);
type GlFramebufferTexture2DFn = unsafe extern "system" fn(
    target: u32,
    attachment: u32,
    textarget: u32,
    texture: u32,
    level: i32,
);
type GlCheckFramebufferStatusFn = unsafe extern "system" fn(target: u32) -> u32;
type GlBlitFramebufferFn = unsafe extern "system" fn(
    src_x0: i32,
    src_y0: i32,
    src_x1: i32,
    src_y1: i32,
    dst_x0: i32,
    dst_y0: i32,
    dst_x1: i32,
    dst_y1: i32,
    mask: u32,
    filter: u32,
);

struct InteropProcs {
    open_device: DxOpenDeviceNvFn,
    close_device: DxCloseDeviceNvFn,
    register_object: DxRegisterObjectNvFn,
    unregister_object: DxUnregisterObjectNvFn,
    lock_objects: DxLockObjectsNvFn,
    unlock_objects: DxUnlockObjectsNvFn,
    gen_framebuffers: GlGenFramebuffersFn,
    delete_framebuffers: GlDeleteFramebuffersFn,
    bind_framebuffer: GlBindFramebufferFn,
    framebuffer_texture_2d: GlFramebufferTexture2DFn,
    check_framebuffer_status: GlCheckFramebufferStatusFn,
    blit_framebuffer: GlBlitFramebufferFn,
}

pub(crate) struct GlInteropState {
    procs: InteropProcs,
    _device: ID3D11Device,
    _context: ID3D11DeviceContext,
    swap_chain: IDXGISwapChain,
    _texture: ID3D11Texture2D,
    dummy_hwnd: SysHwnd,
    shared_handle: u64,
    dx_device: *mut c_void,
    dx_object: *mut c_void,
    gl_texture: u32,
    draw_fbo: u32,
    width: u32,
    height: u32,
}

unsafe impl Send for GlInteropState {}

static GL_GPU_DISABLED: AtomicBool = AtomicBool::new(false);
static GL_GPU_UNAVAILABLE_LOGGED: AtomicBool = AtomicBool::new(false);
static GL_DUMMY_PRESENT_ACTIVE: AtomicBool = AtomicBool::new(false);

struct DummyPresentGuard;

impl DummyPresentGuard {
    fn enter() -> Self {
        GL_DUMMY_PRESENT_ACTIVE.store(true, Ordering::Release);
        Self
    }
}

impl Drop for DummyPresentGuard {
    fn drop(&mut self) {
        GL_DUMMY_PRESENT_ACTIVE.store(false, Ordering::Release);
    }
}

fn latch_disable(reason: &str) {
    if !GL_GPU_DISABLED.swap(true, Ordering::AcqRel) {
        verbose_log(&format!(
            "opengl interop: latch-disabling GPU path, falling back to glReadPixels CPU path ({reason})"
        ));
    }
}

pub(crate) fn gpu_path_disabled() -> bool {
    GL_GPU_DISABLED.load(Ordering::Acquire)
}

pub(crate) fn dummy_present_active() -> bool {
    GL_DUMMY_PRESENT_ACTIVE.load(Ordering::Acquire)
}

unsafe fn load_proc<T>(name: &[u8]) -> Option<T> {
    debug_assert_eq!(
        name.last(),
        Some(&0),
        "wglGetProcAddress name must be NUL-terminated"
    );
    let proc = wglGetProcAddress(name.as_ptr());
    match proc {
        Some(proc) => Some(std::mem::transmute_copy::<_, T>(&proc)),
        None => None,
    }
}

impl InteropProcs {
    unsafe fn load() -> Option<Self> {
        if wglGetCurrentContext().is_null() {
            return None;
        }
        let open_device = load_proc::<DxOpenDeviceNvFn>(b"wglDXOpenDeviceNV\0")?;
        let close_device = load_proc::<DxCloseDeviceNvFn>(b"wglDXCloseDeviceNV\0")?;
        let register_object = load_proc::<DxRegisterObjectNvFn>(b"wglDXRegisterObjectNV\0")?;
        let unregister_object = load_proc::<DxUnregisterObjectNvFn>(b"wglDXUnregisterObjectNV\0")?;
        let lock_objects = load_proc::<DxLockObjectsNvFn>(b"wglDXLockObjectsNV\0")?;
        let unlock_objects = load_proc::<DxUnlockObjectsNvFn>(b"wglDXUnlockObjectsNV\0")?;
        let gen_framebuffers = load_proc::<GlGenFramebuffersFn>(b"glGenFramebuffers\0")?;
        let delete_framebuffers = load_proc::<GlDeleteFramebuffersFn>(b"glDeleteFramebuffers\0")?;
        let bind_framebuffer = load_proc::<GlBindFramebufferFn>(b"glBindFramebuffer\0")?;
        let framebuffer_texture_2d =
            load_proc::<GlFramebufferTexture2DFn>(b"glFramebufferTexture2D\0")?;
        let check_framebuffer_status =
            load_proc::<GlCheckFramebufferStatusFn>(b"glCheckFramebufferStatus\0")?;
        let blit_framebuffer = load_proc::<GlBlitFramebufferFn>(b"glBlitFramebuffer\0")?;
        Some(Self {
            open_device,
            close_device,
            register_object,
            unregister_object,
            lock_objects,
            unlock_objects,
            gen_framebuffers,
            delete_framebuffers,
            bind_framebuffer,
            framebuffer_texture_2d,
            check_framebuffer_status,
            blit_framebuffer,
        })
    }
}

unsafe fn create_interop_d3d11_device()
-> Option<(ID3D11Device, ID3D11DeviceContext, IDXGISwapChain, SysHwnd)> {
    let dummy_hwnd = crate::create_dummy_window();
    if dummy_hwnd.is_null() {
        verbose_log("opengl interop: failed to create dummy D3D11 flush window");
        return None;
    }

    let desc = DXGI_SWAP_CHAIN_DESC {
        BufferDesc: DXGI_MODE_DESC {
            Width: 2,
            Height: 2,
            RefreshRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ScanlineOrdering: DXGI_MODE_SCANLINE_ORDER_UNSPECIFIED,
            Scaling: DXGI_MODE_SCALING_UNSPECIFIED,
        },
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
        BufferCount: 2,
        OutputWindow: WinHwnd(dummy_hwnd),
        Windowed: WinBool(1),
        SwapEffect: DXGI_SWAP_EFFECT_DISCARD,
        Flags: 0,
    };
    let mut swap_chain = None;
    let mut device = None;
    let mut context = None;
    let result = D3D11CreateDeviceAndSwapChain(
        None,
        D3D_DRIVER_TYPE_HARDWARE,
        WinHmodule(null_mut()),
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        None,
        D3D11_SDK_VERSION,
        Some(&desc),
        Some(&mut swap_chain),
        Some(&mut device),
        None,
        Some(&mut context),
    );
    if result.is_err() {
        let _ = DestroyWindow(dummy_hwnd);
        return None;
    }
    match (device, context, swap_chain) {
        (Some(device), Some(context), Some(swap_chain)) => {
            Some((device, context, swap_chain, dummy_hwnd))
        }
        _ => {
            let _ = DestroyWindow(dummy_hwnd);
            None
        }
    }
}

unsafe fn create_shared_texture(
    device: &ID3D11Device,
    width: u32,
    height: u32,
) -> Option<(ID3D11Texture2D, u64)> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
        CPUAccessFlags: 0,
        MiscFlags: D3D11_RESOURCE_MISC_SHARED.0 as u32,
    };
    let mut texture = None;
    if device
        .CreateTexture2D(&desc, None, Some(&mut texture))
        .is_err()
    {
        return None;
    }
    let texture = texture?;
    let handle = texture
        .cast::<IDXGIResource>()
        .and_then(|resource| resource.GetSharedHandle())
        .ok()?;
    Some((texture, handle.0 as usize as u64))
}

impl GlInteropState {
    unsafe fn create(width: u32, height: u32) -> Option<Self> {
        let procs = InteropProcs::load()?;
        let (device, context, swap_chain, dummy_hwnd) = create_interop_d3d11_device()?;
        let (texture, shared_handle) = match create_shared_texture(&device, width, height) {
            Some(texture) => texture,
            None => {
                let _ = DestroyWindow(dummy_hwnd);
                return None;
            }
        };
        if shared_handle == 0 {
            let _ = DestroyWindow(dummy_hwnd);
            return None;
        }

        let dx_device = (procs.open_device)(device.as_raw());
        if dx_device.is_null() {
            verbose_log("opengl interop: wglDXOpenDeviceNV returned NULL");
            let _ = DestroyWindow(dummy_hwnd);
            return None;
        }
        verbose_log("opengl interop: wglDXOpenDeviceNV opened private D3D11 device");

        let mut gl_texture = 0u32;
        glGenTextures(1, &mut gl_texture);
        if gl_texture == 0 {
            (procs.close_device)(dx_device);
            let _ = DestroyWindow(dummy_hwnd);
            return None;
        }

        let dx_object = (procs.register_object)(
            dx_device,
            texture.as_raw(),
            gl_texture,
            GL_TEXTURE_2D,
            WGL_ACCESS_WRITE_DISCARD_NV,
        );
        if dx_object.is_null() {
            verbose_log("opengl interop: wglDXRegisterObjectNV returned NULL");
            glDeleteTextures(1, &gl_texture);
            (procs.close_device)(dx_device);
            let _ = DestroyWindow(dummy_hwnd);
            return None;
        }
        verbose_log(&format!(
            "opengl interop: registered D3D11 texture <-> GL texture {gl_texture} ({width}x{height} BGRA)"
        ));

        let mut draw_fbo = 0u32;
        (procs.gen_framebuffers)(1, &mut draw_fbo);
        if draw_fbo == 0 {
            (procs.unregister_object)(dx_device, dx_object);
            glDeleteTextures(1, &gl_texture);
            (procs.close_device)(dx_device);
            let _ = DestroyWindow(dummy_hwnd);
            return None;
        }

        Some(Self {
            procs,
            _device: device,
            _context: context,
            swap_chain,
            _texture: texture,
            dummy_hwnd,
            shared_handle,
            dx_device,
            dx_object,
            gl_texture,
            draw_fbo,
            width,
            height,
        })
    }

    fn matches(&self, width: u32, height: u32) -> bool {
        self.width == width && self.height == height
    }

    unsafe fn blit_default_framebuffer(&self) -> bool {
        let objects = [self.dx_object];

        let mut prev_read_fbo = 0i32;
        let mut prev_draw_fbo = 0i32;
        glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &mut prev_read_fbo);
        glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &mut prev_draw_fbo);
        let mut prev_tex = 0i32;
        glGetIntegerv(GL_TEXTURE_BINDING_2D, &mut prev_tex);

        if (self.procs.lock_objects)(self.dx_device, 1, objects.as_ptr()) == 0 {
            verbose_log("opengl interop: wglDXLockObjectsNV FAILED");
            return false;
        }

        (self.procs.bind_framebuffer)(GL_DRAW_FRAMEBUFFER, self.draw_fbo);
        (self.procs.framebuffer_texture_2d)(
            GL_DRAW_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_TEXTURE_2D,
            self.gl_texture,
            0,
        );
        let status = (self.procs.check_framebuffer_status)(GL_DRAW_FRAMEBUFFER);
        if status != GL_FRAMEBUFFER_COMPLETE {
            verbose_log(&format!(
                "opengl interop: draw FBO incomplete (status 0x{status:04X}); unlocking and falling back"
            ));
            (self.procs.framebuffer_texture_2d)(
                GL_DRAW_FRAMEBUFFER,
                GL_COLOR_ATTACHMENT0,
                GL_TEXTURE_2D,
                0,
                0,
            );
            (self.procs.bind_framebuffer)(GL_DRAW_FRAMEBUFFER, prev_draw_fbo as u32);
            (self.procs.bind_framebuffer)(GL_READ_FRAMEBUFFER, prev_read_fbo as u32);
            let _ = (self.procs.unlock_objects)(self.dx_device, 1, objects.as_ptr());
            return false;
        }

        (self.procs.bind_framebuffer)(GL_READ_FRAMEBUFFER, 0);
        let w = self.width as i32;
        let h = self.height as i32;
        (self.procs.blit_framebuffer)(
            0,
            0,
            w,
            h,
            0,
            h,
            w,
            0,
            GL_COLOR_BUFFER_BIT,
            if w == self.width as i32 && h == self.height as i32 {
                GL_NEAREST
            } else {
                GL_LINEAR
            },
        );
        let blit_err = glGetError();

        (self.procs.framebuffer_texture_2d)(
            GL_DRAW_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_TEXTURE_2D,
            0,
            0,
        );
        (self.procs.bind_framebuffer)(GL_DRAW_FRAMEBUFFER, prev_draw_fbo as u32);
        (self.procs.bind_framebuffer)(GL_READ_FRAMEBUFFER, prev_read_fbo as u32);
        glBindTexture(GL_TEXTURE_2D, prev_tex as u32);

        glFinish();

        if (self.procs.unlock_objects)(self.dx_device, 1, objects.as_ptr()) == 0 {
            verbose_log("opengl interop: wglDXUnlockObjectsNV FAILED");
            return false;
        }
        self._context.Flush();
        let present_result = {
            let _guard = DummyPresentGuard::enter();
            self.swap_chain.Present(0, DXGI_PRESENT(0))
        };
        if present_result.is_err() {
            verbose_log(&format!(
                "opengl interop: dummy D3D11 Present flush failed hr={:#010x}",
                present_result.0 as u32
            ));
            return false;
        }

        if blit_err != GL_NO_ERROR {
            verbose_log(&format!(
                "opengl interop: glBlitFramebuffer raised GL error 0x{blit_err:04X}"
            ));
            return false;
        }
        true
    }
}

impl Drop for GlInteropState {
    fn drop(&mut self) {
        unsafe {
            if !self.dx_object.is_null() {
                let _ = (self.procs.unregister_object)(self.dx_device, self.dx_object);
            }
            if self.draw_fbo != 0 {
                (self.procs.delete_framebuffers)(1, &self.draw_fbo);
            }
            if self.gl_texture != 0 {
                glDeleteTextures(1, &self.gl_texture);
            }
            if !self.dx_device.is_null() {
                let _ = (self.procs.close_device)(self.dx_device);
            }
            if !self.dummy_hwnd.is_null() {
                let _ = DestroyWindow(self.dummy_hwnd);
            }
        }
    }
}

unsafe fn interop_state_for_frame(
    state: &mut HookState,
    width: u32,
    height: u32,
) -> Option<&mut GlInteropState> {
    let recreate = state
        .gl_interop
        .as_ref()
        .map(|interop| !interop.matches(width, height))
        .unwrap_or(true);
    if recreate {
        state.gl_interop = None;
        match GlInteropState::create(width, height) {
            Some(interop) => state.gl_interop = Some(interop),
            None => return None,
        }
    }
    state.gl_interop.as_mut()
}

pub(crate) unsafe fn capture_opengl_frame_gpu(
    state: &mut HookState,
    hwnd: SysHwnd,
    width: u32,
    height: u32,
) -> bool {
    if gpu_path_disabled() {
        return false;
    }

    let Some(interop) = interop_state_for_frame(state, width, height) else {
        if !GL_GPU_UNAVAILABLE_LOGGED.swap(true, Ordering::AcqRel) {
            verbose_log(
                "opengl interop: WGL_NV_DX_interop2 unavailable or pipeline creation failed",
            );
        }
        latch_disable("interop pipeline creation failed");
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED);
        return false;
    };

    let shared_handle = interop.shared_handle;
    let blitted = interop.blit_default_framebuffer();
    if !blitted {
        latch_disable("lock/blit failed after successful registration");
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED);
        return false;
    }

    mark_present(state, GAME_CAPTURE_API_OPENGL);
    set_capture_flags(state, 0);
    set_fallback_reason(state, GAME_CAPTURE_FALLBACK_NONE);
    let published = publish_shared_texture_frame(
        state,
        hwnd,
        width,
        height,
        DXGI_FORMAT(DXGI_FORMAT_B8G8R8A8_UNORM.0),
        shared_handle,
    );
    if published {
        verbose_log(&format!(
            "opengl interop: published shared-texture frame {width}x{height} (handle 0x{shared_handle:X})"
        ));
    }
    published
}

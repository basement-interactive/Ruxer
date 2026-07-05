//! Continuous native screen-capture pipeline (Windows only).
//!
//! Video is captured via Windows.Graphics.Capture (WGC) — the same D3D11 /
//! `GraphicsCaptureItem` machinery `screen_sources.rs` uses for single-frame
//! thumbnails, extended here into a continuous free-threaded capture loop.
//! Audio is captured via WASAPI loopback on the default render endpoint
//! (i.e. system output audio).
//!
//! Encoded frames are pushed to `tokio::sync::broadcast` channels so a local
//! axum WebSocket server (implemented elsewhere) can drain them for any number
//! of subscribers cheaply. Payloads are `Arc<Vec<u8>>` so fan-out clones are
//! O(1).
//!
//! Video frame format: downscaled frames are JPEG-encoded (quality 80) directly
//! from the WGC BGRA staging buffer via the pure-Rust, SIMD-accelerated
//! `jpeg-encoder` crate (no BGRA->RGBA swap, no intermediate RGB copy) — this
//! keeps the local WebSocket ~20x below raw RGBA (1080p raw is ~8 MiB/frame).
//! If JPEG encoding ever fails, we fall back to RAW downscaled RGBA-order bytes
//! with a 12-byte little-endian header `[width u32][height u32][format u32
//! (0=RGBA8)]` followed by `width*height*4` tightly-packed bytes; the JS bridge
//! detects JPEG by its `FF D8` magic and handles either.
//!
//! Audio PCM format: 32-bit float little-endian, interleaved by channel, with
//! the sample rate + channel count reported once via [`AudioFormat`].

use std::sync::atomic::AtomicBool;
#[cfg(windows)]
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;

use tokio::sync::broadcast;

/// Broadcast channel capacity (in frames). Slow subscribers lag/drop rather
/// than block the capture threads.
#[cfg(windows)]
const VIDEO_CHANNEL_CAP: usize = 8;
#[cfg(windows)]
const AUDIO_CHANNEL_CAP: usize = 64;

/// Format tag emitted in the 12-byte video frame header. 0 = tightly-packed
/// 8-bit RGBA.
#[cfg(windows)]
const VIDEO_FORMAT_RGBA8: u32 = 0;

/// Audio PCM format description sent to the JS side once at stream start.
#[derive(Clone, Copy)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

/// A live capture session: broadcast senders + the worker thread handles and
/// the shared stop flag used to tear them down.
///
/// Video encoding runs in a parallel, order-preserving pool: the capture thread
/// only grabs frames + dispatches raw jobs; a set of encode workers downscale +
/// JPEG-encode in parallel; and a collector reassembles results in capture
/// order before broadcasting. `stop()` must join ALL of these
/// (capture + workers + collector) — they live in `video_threads`.
// stop/video_threads/audio_thread are only READ by the Windows capture
// implementation; on other targets the session type still exists (the
// subscribe_* API is platform-neutral) but those fields are never touched.
#[cfg_attr(not(windows), allow(dead_code))]
struct Session {
    video_tx: broadcast::Sender<Arc<Vec<u8>>>,
    audio: Option<(AudioFormat, broadcast::Sender<Arc<Vec<u8>>>)>,
    stop: Arc<AtomicBool>,
    /// All threads of the video pipeline: the capture/dispatch thread, the N
    /// encode workers, and the collector. Joined (in push order) on stop.
    video_threads: Vec<JoinHandle<()>>,
    audio_thread: Option<JoinHandle<()>>,
}

fn session_slot() -> &'static Mutex<Option<Session>> {
    static SESSION: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
    SESSION.get_or_init(|| Mutex::new(None))
}

/// Start capturing `source_id` (`screen:N:0` or `window:HWND:0`). `fps` caps
/// the video frame rate; `max_width` downscales frames whose width exceeds it
/// (aspect-preserving); `want_audio` also starts WASAPI system-loopback
/// capture. Calling start again first stops any prior session. Returns
/// `Err(String)` if the source can't be resolved or capture init fails.
pub fn start(source_id: &str, fps: u32, max_width: u32, want_audio: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_impl::start(source_id, fps, max_width, want_audio)
    }
    #[cfg(not(windows))]
    {
        let _ = (source_id, fps, max_width, want_audio);
        Err("native capture is Windows-only".into())
    }
}

/// Stop all capture threads and drop the session. Safe to call when not
/// running.
pub fn stop() {
    #[cfg(windows)]
    {
        windows_impl::stop();
    }
}

/// A fresh broadcast receiver of encoded VIDEO frames (raw RGBA with a 12-byte
/// `[width u32 le][height u32 le][format u32]` header). `None` if no session is
/// running.
pub fn subscribe_video() -> Option<broadcast::Receiver<Arc<Vec<u8>>>> {
    let guard = session_slot().lock().ok()?;
    let session = guard.as_ref()?;
    Some(session.video_tx.subscribe())
}

/// The audio format + a fresh broadcast receiver of raw interleaved PCM audio
/// frames (32-bit float little-endian, interleaved by channel). `None` if no
/// session is running or audio is disabled.
pub fn subscribe_audio() -> Option<(AudioFormat, broadcast::Receiver<Arc<Vec<u8>>>)> {
    let guard = session_slot().lock().ok()?;
    let session = guard.as_ref()?;
    let (fmt, tx) = session.audio.as_ref()?;
    Some((*fmt, tx.subscribe()))
}

#[cfg(windows)]
pub(crate) mod windows_impl {
    use super::*;

    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::HMONITOR;

    /// Resolve a `screen:N:0` / `window:HWND:0` id into a capture target.
    ///
    /// Stored as raw `isize` handle values (not `HMONITOR`/`HWND`, which wrap
    /// `*mut c_void` and so aren't `Send`) so the target can cross into the
    /// capture thread. The real handles are reconstructed inside the thread.
    #[derive(Clone, Copy)]
    enum Target {
        Monitor(isize),
        Window(isize),
    }

    impl Target {
        fn as_monitor(self) -> Option<HMONITOR> {
            match self {
                Target::Monitor(raw) => Some(HMONITOR(raw as *mut _)),
                Target::Window(_) => None,
            }
        }
        fn as_window(self) -> Option<HWND> {
            match self {
                Target::Window(raw) => Some(HWND(raw as *mut _)),
                Target::Monitor(_) => None,
            }
        }
    }

    /// Parse the source id (mirrors `screen_sources.rs` id formats) and resolve
    /// it to an HMONITOR (Nth in `EnumDisplayMonitors` order) or HWND.
    fn resolve_target(source_id: &str) -> Result<Target, String> {
        let mut parts = source_id.splitn(3, ':');
        let kind = parts.next().unwrap_or("");
        let value = parts
            .next()
            .ok_or_else(|| format!("malformed source id: {source_id}"))?;
        match kind {
            "screen" => {
                // The middle token is the raw HMONITOR value the picker embeds
                // (screen_sources.rs `screen:{hmon}:0`), NOT an enumeration index
                // — two independent EnumDisplayMonitors passes can disagree on
                // order. Match it against the live monitors; fall back to
                // treating it as an index for any old `screen:N:0` id.
                let raw: isize = value
                    .parse()
                    .map_err(|_| format!("bad screen id in {source_id}"))?;
                let monitors = enumerate_monitor_handles();
                if monitors.iter().any(|&m| m == raw) {
                    Ok(Target::Monitor(raw))
                } else if let Some(hmon) = nth_monitor(raw as usize) {
                    Ok(Target::Monitor(hmon.0 as isize))
                } else {
                    Err(format!("monitor {raw} not found in {source_id}"))
                }
            }
            "window" => {
                let hwnd_raw: isize = value
                    .parse()
                    .map_err(|_| format!("bad hwnd in {source_id}"))?;
                if hwnd_raw == 0 {
                    return Err(format!("null hwnd in {source_id}"));
                }
                Ok(Target::Window(hwnd_raw))
            }
            other => Err(format!("unknown source kind '{other}' in {source_id}")),
        }
    }

    /// Enumerate monitors in `EnumDisplayMonitors` order and return the Nth
    /// HMONITOR (same ordering `screen_sources.rs` assigns `screen:N:0`).
    fn nth_monitor(index: usize) -> Option<HMONITOR> {
        use std::cell::RefCell;
        use windows::core::BOOL;
        use windows::Win32::Foundation::{LPARAM, RECT, TRUE};
        use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC};

        thread_local! {
            static MONITORS: RefCell<Vec<isize>> = const { RefCell::new(Vec::new()) };
        }

        unsafe extern "system" fn enum_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            _lparam: LPARAM,
        ) -> BOOL {
            MONITORS.with(|m| m.borrow_mut().push(hmonitor.0 as isize));
            TRUE
        }

        MONITORS.with(|m| m.borrow_mut().clear());
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(enum_proc), LPARAM(0));
        }
        let raw = MONITORS.with(|m| m.borrow().get(index).copied())?;
        Some(HMONITOR(raw as *mut _))
    }

    /// All live HMONITOR handles (as isize), used to validate a picker-embedded
    /// HMONITOR id before capturing it (the picker embeds the raw handle, not an
    /// index — see resolve_target).
    fn enumerate_monitor_handles() -> Vec<isize> {
        use std::cell::RefCell;
        use windows::core::BOOL;
        use windows::Win32::Foundation::{LPARAM, RECT, TRUE};
        use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC};

        thread_local! {
            static HANDLES: RefCell<Vec<isize>> = const { RefCell::new(Vec::new()) };
        }

        unsafe extern "system" fn enum_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            _lparam: LPARAM,
        ) -> BOOL {
            HANDLES.with(|m| m.borrow_mut().push(hmonitor.0 as isize));
            TRUE
        }

        HANDLES.with(|m| m.borrow_mut().clear());
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(enum_proc), LPARAM(0));
        }
        HANDLES.with(|m| m.borrow().clone())
    }

    pub fn start(
        source_id: &str,
        fps: u32,
        max_width: u32,
        want_audio: bool,
    ) -> Result<(), String> {
        // Idempotent-ish: always tear down any prior session first.
        stop();

        let target = resolve_target(source_id)?;
        let fps = fps.max(1);
        let frame_interval = std::time::Duration::from_millis((1000 / fps).max(1) as u64);

        let stop_flag = Arc::new(AtomicBool::new(false));

        let (video_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(VIDEO_CHANNEL_CAP);

        // Spin up the video capture thread. It resolves and validates the WGC
        // item itself, then spawns the parallel encode workers + collector (see
        // `video::run`) and reports their handles alongside the init result. If
        // init fails hard it just exits (logged), but we pre-validate the D3D
        // device + item so `start` can report failure.
        let video_stop = stop_flag.clone();
        let video_sender = video_tx.clone();
        let (init_tx, init_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        // The capture thread reports the encode-worker + collector handles here
        // once it has spawned them (after a successful init), so `stop` can join
        // the whole pipeline.
        let (aux_tx, aux_rx) = std::sync::mpsc::channel::<Vec<JoinHandle<()>>>();
        let video_thread = std::thread::Builder::new()
            .name("fluxer-wgc-video".into())
            .spawn(move || {
                video::run(
                    target,
                    max_width,
                    frame_interval,
                    video_stop,
                    video_sender,
                    init_tx,
                    aux_tx,
                );
            })
            .map_err(|e| format!("failed to spawn video thread: {e}"))?;

        // Wait for the video thread to report whether capture init succeeded.
        match init_rx.recv() {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                stop_flag.store(true, Ordering::SeqCst);
                let _ = video_thread.join();
                return Err(e);
            }
            Err(_) => {
                stop_flag.store(true, Ordering::SeqCst);
                let _ = video_thread.join();
                return Err("video capture thread died during init".into());
            }
        }

        // Init succeeded: collect the encode-worker + collector handles so stop
        // can join them. If the capture thread somehow dropped `aux_tx` without
        // sending (shouldn't happen on the success path), fall back to an empty
        // set rather than blocking here.
        let mut video_threads = vec![video_thread];
        if let Ok(mut aux) = aux_rx.recv() {
            video_threads.append(&mut aux);
        }

        // Audio is best-effort: failures never abort video.
        //
        // Which audio to capture depends on the share type:
        //   * window share  → ONLY the target window's process tree ("Capture
        //     app audio"), via WASAPI process loopback INCLUDE mode.
        //   * screen share  → everything EXCEPT our own process tree, via
        //     process loopback EXCLUDE mode — capturing the whole device
        //     loopback would re-broadcast Fluxer's own voice playback (echo).
        let audio_target = match target {
            Target::Window(raw) => {
                let mut pid = 0u32;
                unsafe {
                    windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
                        HWND(raw as *mut _),
                        Some(&mut pid),
                    );
                }
                if pid != 0 {
                    audio::AudioTarget::IncludeProcess(pid)
                } else {
                    tracing::warn!("could not resolve window PID; excluding own audio only");
                    audio::AudioTarget::ExcludeSelf
                }
            }
            Target::Monitor(_) => audio::AudioTarget::ExcludeSelf,
        };
        let mut audio_pair: Option<(AudioFormat, broadcast::Sender<Arc<Vec<u8>>>)> = None;
        let mut audio_thread: Option<JoinHandle<()>> = None;
        if want_audio {
            let (audio_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(AUDIO_CHANNEL_CAP);
            let (afmt_tx, afmt_rx) = std::sync::mpsc::channel::<Option<AudioFormat>>();
            let audio_stop = stop_flag.clone();
            let audio_sender = audio_tx.clone();
            match std::thread::Builder::new()
                .name("fluxer-wasapi-audio".into())
                .spawn(move || {
                    audio::run(audio_stop, audio_sender, afmt_tx, audio_target);
                }) {
                Ok(handle) => {
                    // The audio thread reports its resolved format (or None on
                    // init failure) before entering its capture loop.
                    match afmt_rx.recv() {
                        Ok(Some(fmt)) => {
                            audio_pair = Some((fmt, audio_tx));
                            audio_thread = Some(handle);
                        }
                        _ => {
                            // Init failed: the thread has already (or will
                            // shortly) exit. Join it so it doesn't leak.
                            let _ = handle.join();
                            tracing::warn!("audio capture unavailable; continuing video-only");
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("failed to spawn audio thread: {e}; continuing video-only");
                }
            }
        }

        let session = Session {
            video_tx,
            audio: audio_pair,
            stop: stop_flag,
            video_threads,
            audio_thread,
        };

        if let Ok(mut guard) = session_slot().lock() {
            *guard = Some(session);
        } else {
            // Mutex poisoned — bail out cleanly rather than leak threads.
            return Err("capture session lock poisoned".into());
        }

        Ok(())
    }

    pub fn stop() {
        let session = match session_slot().lock() {
            Ok(mut guard) => guard.take(),
            Err(poisoned) => {
                // Recover from poison so a prior panic doesn't wedge capture.
                let mut guard = poisoned.into_inner();
                guard.take()
            }
        };
        if let Some(mut session) = session {
            session.stop.store(true, Ordering::SeqCst);
            // Join the whole video pipeline. The vec is ordered
            // capture/dispatch → encode workers → collector, which is also the
            // shutdown-propagation order: the stop flag makes the capture loop
            // exit and drop its per-worker dispatch senders; that disconnects
            // each worker's input channel, so the workers finish their in-flight
            // job and exit; that drops their output senders, so the collector's
            // ordered `recv` returns `Err` and it exits. Joining in this order
            // therefore never deadlocks (each `recv`/`join` is guaranteed to
            // unblock as the previous stage tears down).
            for handle in session.video_threads.drain(..) {
                let _ = handle.join();
            }
            if let Some(handle) = session.audio_thread.take() {
                let _ = handle.join();
            }
        }
    }

    /// Continuous WGC video capture. `pub(crate)` so the throughput benchmark
    /// in the crate-level `tests` module can call `maybe_downscale` /
    /// `encode_frame` directly (they exercise the exact worker code path).
    pub(crate) mod video {
        use super::Target;
        use crate::capture::{VIDEO_FORMAT_RGBA8};
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::mpsc::{Sender as StdSender, SyncSender};
        use std::sync::Arc;
        use std::thread::JoinHandle;
        use std::time::{Duration, Instant};
        use tokio::sync::broadcast;

        use windows::core::Interface;
        use windows::Graphics::Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        };
        use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
        use windows::Graphics::DirectX::DirectXPixelFormat;
        use windows::Win32::Graphics::Direct3D::{
            D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP,
        };
        use windows::Win32::Graphics::Direct3D11::{
            D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
            D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
            D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
        };
        use windows::Win32::Graphics::Dxgi::Common::{
            DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
        };
        use windows::Win32::Graphics::Dxgi::IDXGIDevice;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        use windows::Win32::System::WinRT::Direct3D11::{
            CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
        };
        use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

        struct Wgc {
            device: ID3D11Device,
            context: ID3D11DeviceContext,
            winrt_device: IDirect3DDevice,
            /// Staging texture reused across frames (recreated only on size
            /// change). Creating one per frame costs an allocation + driver
            /// round-trip on every single frame — measurable at 60 fps.
            staging: Option<(u32, u32, ID3D11Texture2D)>,
        }

        impl Wgc {
            fn new() -> Result<Self, String> {
                if !GraphicsCaptureSession::IsSupported().unwrap_or(false) {
                    return Err("Windows.Graphics.Capture is not supported".into());
                }
                let (device, context) =
                    create_d3d_device().ok_or_else(|| "D3D11 device creation failed".to_string())?;
                let winrt_device = unsafe {
                    let dxgi: IDXGIDevice = device
                        .cast()
                        .map_err(|e| format!("IDXGIDevice cast failed: {e}"))?;
                    CreateDirect3D11DeviceFromDXGIDevice(&dxgi)
                        .map_err(|e| format!("CreateDirect3D11DeviceFromDXGIDevice failed: {e}"))?
                        .cast::<IDirect3DDevice>()
                        .map_err(|e| format!("IDirect3DDevice cast failed: {e}"))?
                };
                Ok(Self {
                    device,
                    context,
                    winrt_device,
                    staging: None,
                })
            }

            fn create_item(&self, target: &Target) -> Result<GraphicsCaptureItem, String> {
                let interop =
                    windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                        .map_err(|e| format!("capture item interop factory failed: {e}"))?;
                let item = match (target.as_monitor(), target.as_window()) {
                    (Some(hmon), _) => unsafe { interop.CreateForMonitor(hmon) },
                    (_, Some(hwnd)) => unsafe { interop.CreateForWindow(hwnd) },
                    (None, None) => return Err("invalid capture target".into()),
                }
                .map_err(|e| format!("CreateFor* failed: {e}"))?;
                Ok(item)
            }

            /// Copy a captured frame's D3D texture into a staging texture, map
            /// it, and return `(width, height, bgra_bytes)`. The bytes are kept
            /// in the native WGC BGRA order — no channel swap — because the
            /// downstream JPEG encoder consumes BGRA directly and the box/
            /// triangle downscale is channel-order agnostic.
            fn frame_to_bgra(
                &mut self,
                frame: &Direct3D11CaptureFrame,
            ) -> Option<(u32, u32, Vec<u8>)> {
                let surface = frame.Surface().ok()?;
                let access: IDirect3DDxgiInterfaceAccess = surface.cast().ok()?;
                let texture: ID3D11Texture2D = unsafe { access.GetInterface() }.ok()?;
                unsafe {
                    let mut desc = D3D11_TEXTURE2D_DESC::default();
                    texture.GetDesc(&mut desc);
                    if desc.Width == 0 || desc.Height == 0 {
                        return None;
                    }
                    if self.staging.as_ref().map(|(w, h, _)| (*w, *h))
                        != Some((desc.Width, desc.Height))
                    {
                        let staging_desc = D3D11_TEXTURE2D_DESC {
                            Width: desc.Width,
                            Height: desc.Height,
                            MipLevels: 1,
                            ArraySize: 1,
                            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                            SampleDesc: DXGI_SAMPLE_DESC {
                                Count: 1,
                                Quality: 0,
                            },
                            Usage: D3D11_USAGE_STAGING,
                            BindFlags: 0,
                            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                            MiscFlags: 0,
                        };
                        let mut staging: Option<ID3D11Texture2D> = None;
                        self.device
                            .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                            .ok()?;
                        self.staging = Some((desc.Width, desc.Height, staging?));
                    }
                    let staging = &self.staging.as_ref()?.2;
                    self.context.CopyResource(staging, &texture);
                    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                    self.context
                        .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                        .ok()?;
                    let w = desc.Width as usize;
                    let h = desc.Height as usize;
                    let mut buf = vec![0u8; w * h * 4];
                    let src = mapped.pData as *const u8;
                    for row in 0..h {
                        std::ptr::copy_nonoverlapping(
                            src.add(row * mapped.RowPitch as usize),
                            buf[row * w * 4..].as_mut_ptr(),
                            w * 4,
                        );
                    }
                    self.context.Unmap(staging, 0);
                    // Leave the buffer in native BGRA order. JPEG ignores
                    // alpha, and the encoder consumes BGRA directly, so the
                    // former per-pixel BGRA->RGBA swap + alpha fixup loop is
                    // pure overhead we can skip entirely.
                    Some((desc.Width, desc.Height, buf))
                }
            }
        }

        fn create_d3d_device() -> Option<(ID3D11Device, ID3D11DeviceContext)> {
            // WARP fallback covers RDP/headless sessions with no hardware GPU.
            for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
                if let Some(pair) = try_create_device(driver) {
                    return Some(pair);
                }
            }
            None
        }

        fn try_create_device(
            driver: D3D_DRIVER_TYPE,
        ) -> Option<(ID3D11Device, ID3D11DeviceContext)> {
            unsafe {
                let mut device: Option<ID3D11Device> = None;
                let mut context: Option<ID3D11DeviceContext> = None;
                D3D11CreateDevice(
                    None,
                    driver,
                    windows::Win32::Foundation::HMODULE::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )
                .ok()?;
                Some((device?, context?))
            }
        }

        /// Downscale to `max_width` (aspect preserving), BGRA in/out. Thin
        /// wrapper over `fluxer-capture-codec`, which is compiled at
        /// opt-level 3 even in dev builds — the resize is a monomorphized
        /// generic, so calling `image` directly from this opt-level-0 crate
        /// ran it unoptimized (~10x slower; a few fps + seconds of latency).
        ///
        /// `pub(crate)` so the throughput benchmark can exercise the exact
        /// worker code path.
        pub(crate) fn maybe_downscale(
            w: u32,
            h: u32,
            bgra: Vec<u8>,
            max_width: u32,
        ) -> (u32, u32, Vec<u8>) {
            fluxer_capture_codec::downscale_bgra(w, h, bgra, max_width)
        }

        /// JPEG quality for the transport encode. With the fast SIMD encoder we
        /// can afford a higher quality than the old single-threaded path.
        const JPEG_QUALITY: u8 = 80;

        /// Encode a captured BGRA frame for transport. Encodes JPEG directly
        /// from the native BGRA staging buffer (no channel swap, no intermediate
        /// RGB copy) via the SIMD-accelerated `jpeg-encoder` crate. JPEG keeps
        /// the local WebSocket bandwidth ~20x below raw RGBA (1080p raw is
        /// ~8 MiB/frame) and the JS bridge detects it by its `FF D8` magic.
        /// Falls back to the raw + 12-byte-header format only if JPEG encoding
        /// ever fails (unlikely). `w`/`h` fit in `u16` for any real display.
        ///
        /// `pub(crate)` so the throughput benchmark can exercise the exact
        /// worker code path.
        pub(crate) fn encode_frame(w: u32, h: u32, bgra: &[u8]) -> Vec<u8> {
            // JPEG encode runs in `fluxer-capture-codec` (opt-level 3 even in
            // dev — see `maybe_downscale`).
            if let Some(out) = fluxer_capture_codec::encode_jpeg_bgra(w, h, bgra, JPEG_QUALITY) {
                return out;
            }
            // Fallback: raw bytes with the 12-byte header (JS handles both).
            // Note the on-wire bytes here are BGRA-order under the RGBA8 tag;
            // this path only triggers on encoder failure (effectively never).
            let mut out = Vec::with_capacity(12 + bgra.len());
            out.extend_from_slice(&w.to_le_bytes());
            out.extend_from_slice(&h.to_le_bytes());
            out.extend_from_slice(&VIDEO_FORMAT_RGBA8.to_le_bytes());
            out.extend_from_slice(bgra);
            out
        }

        /// A raw capture job handed to an encode worker: the native BGRA staging
        /// bytes plus the source dimensions and the downscale target. Downscale
        /// + JPEG encode happen on the worker, OFF the capture loop.
        struct EncodeJob {
            bgra: Vec<u8>,
            w: u32,
            h: u32,
            max_width: u32,
        }

        /// Choose the encode-worker count. One fewer than the logical CPU count
        /// (the capture/dispatch thread + collector also need cycles), clamped
        /// to [2, 4] so throughput scales past the single-thread ~33 fps cap
        /// without oversubscribing on big or tiny machines.
        fn worker_count() -> usize {
            std::thread::available_parallelism()
                .map(|n| n.get().saturating_sub(1))
                .unwrap_or(3)
                .clamp(2, 4)
        }

        /// Spawn `n` encode workers. Each owns a bounded input channel (raw
        /// jobs) and a bounded output channel (encoded `Arc<Vec<u8>>`). A worker
        /// loops: recv job → `maybe_downscale` → `encode_frame` → send the
        /// encoded frame to its output. It exits when its input channel
        /// disconnects (the dispatcher dropped its sender on shutdown) or its
        /// output channel disconnects (the collector went away). Channel
        /// bounds of 1 keep the in-flight frame count (= pipeline latency)
        /// minimal and let a stalled worker apply backpressure to the
        /// dispatcher via its blocking `send`.
        ///
        /// Returns, per worker: the input `SyncSender` (held by the dispatcher),
        /// the output `Receiver` (held by the collector), and the worker's
        /// `JoinHandle`.
        #[allow(clippy::type_complexity)]
        fn spawn_encode_workers(
            n: usize,
        ) -> (
            Vec<SyncSender<EncodeJob>>,
            Vec<std::sync::mpsc::Receiver<Arc<Vec<u8>>>>,
            Vec<JoinHandle<()>>,
        ) {
            let mut inputs = Vec::with_capacity(n);
            let mut outputs = Vec::with_capacity(n);
            let mut handles = Vec::with_capacity(n);
            for i in 0..n {
                let (job_tx, job_rx) = std::sync::mpsc::sync_channel::<EncodeJob>(1);
                let (out_tx, out_rx) = std::sync::mpsc::sync_channel::<Arc<Vec<u8>>>(1);
                let handle = std::thread::Builder::new()
                    .name(format!("fluxer-wgc-encode-{i}"))
                    .spawn(move || {
                        while let Ok(job) = job_rx.recv() {
                            let (w, h, bgra) =
                                maybe_downscale(job.w, job.h, job.bgra, job.max_width);
                            if bgra.is_empty() {
                                // A downscale failure would desync the ordered
                                // collector (which reads exactly one result per
                                // dispatched job). Emit an empty JPEG-less
                                // payload placeholder is worse than just
                                // encoding the un-resized frame, so fall through
                                // only when there's genuinely nothing to encode:
                                // send a tiny valid JPEG is impossible here, so
                                // send the (empty) buffer straight through — the
                                // collector still gets exactly one result and
                                // order is preserved. Subscribers treat a
                                // sub-`FF D8` payload as a dropped frame.
                                if out_tx.send(Arc::new(Vec::new())).is_err() {
                                    break;
                                }
                                continue;
                            }
                            let payload = encode_frame(w, h, &bgra);
                            if out_tx.send(Arc::new(payload)).is_err() {
                                // Collector gone — stop encoding.
                                break;
                            }
                        }
                    })
                    .expect("spawn encode worker");
                inputs.push(job_tx);
                outputs.push(out_rx);
                handles.push(handle);
            }
            (inputs, outputs, handles)
        }

        /// Spawn the collector. It pulls encoded frames back IN CAPTURE ORDER by
        /// reading worker `i % n`'s output for result `i`, then broadcasts each
        /// to `video_tx`. Because the dispatcher sends frame `i` to worker
        /// `i % n` and the collector reads worker `i % n` for result `i`, order
        /// is preserved with zero reordering buffer. It exits when any worker's
        /// output channel disconnects (capture stopped → workers exited).
        fn spawn_collector(
            outputs: Vec<std::sync::mpsc::Receiver<Arc<Vec<u8>>>>,
            video_tx: broadcast::Sender<Arc<Vec<u8>>>,
        ) -> JoinHandle<()> {
            std::thread::Builder::new()
                .name("fluxer-wgc-collect".into())
                .spawn(move || {
                    let n = outputs.len();
                    if n == 0 {
                        return;
                    }
                    let mut i: usize = 0;
                    loop {
                        match outputs[i % n].recv() {
                            Ok(frame) => {
                                // Ignore send errors (no subscribers is fine).
                                let _ = video_tx.send(frame);
                                i = i.wrapping_add(1);
                            }
                            // A disconnected worker output means shutdown; the
                            // whole pipeline is tearing down, so exit.
                            Err(_) => break,
                        }
                    }
                })
                .expect("spawn collector")
        }

        pub(super) fn run(
            target: Target,
            max_width: u32,
            frame_interval: Duration,
            stop: Arc<AtomicBool>,
            video_tx: broadcast::Sender<Arc<Vec<u8>>>,
            init_tx: StdSender<Result<(), String>>,
            aux_tx: StdSender<Vec<JoinHandle<()>>>,
        ) {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }

            // Build the WGC context + capture session. Report init result.
            let session_state = match init_capture(&target) {
                Ok(state) => {
                    let _ = init_tx.send(Ok(()));
                    state
                }
                Err(e) => {
                    let _ = init_tx.send(Err(e));
                    // No workers/collector spawned; report an empty aux set so
                    // `start` doesn't block waiting for handles.
                    let _ = aux_tx.send(Vec::new());
                    return;
                }
            };
            let CaptureState {
                mut wgc,
                pool,
                session,
            } = session_state;

            // Spin up the parallel, order-preserving encode pool. The capture
            // loop below only grabs frames and dispatches raw jobs round-robin;
            // the workers downscale + JPEG-encode in parallel; the collector
            // reassembles results in capture order and broadcasts them.
            let n = worker_count();
            let (mut inputs, outputs, worker_handles) = spawn_encode_workers(n);
            let collector = spawn_collector(outputs, video_tx);

            // Report the encode workers + collector handles so `stop` can join
            // the whole pipeline. (The capture thread's own handle is added by
            // the caller.)
            let mut aux = worker_handles;
            aux.push(collector);
            let _ = aux_tx.send(aux);

            // Main capture loop — capture + dispatch ONLY (no encode here). The
            // round-robin dispatch index advances in lockstep with the
            // collector's read index, so frame `i` goes to worker `i % n` and
            // the collector reads worker `i % n` for result `i`: order is
            // preserved with no wire-format change.
            let mut frame_index: usize = 0;
            while !stop.load(Ordering::SeqCst) {
                let started = Instant::now();
                let frame: Option<Direct3D11CaptureFrame> = pool.TryGetNextFrame().ok();
                if let Some(frame) = frame {
                    if let Some((w, h, bgra)) = wgc.frame_to_bgra(&frame) {
                        let job = EncodeJob {
                            bgra,
                            w,
                            h,
                            max_width,
                        };
                        // Blocking bounded send keeps the dispatcher and the
                        // collector's round-robin indices in perfect lockstep
                        // (no drop => no desync). All N workers drain in
                        // parallel and the loop is fps-throttled anyway, so a
                        // bound-2 channel rarely blocks. A `SendError` means the
                        // worker is gone (shutdown) — bail out of the loop.
                        if inputs[frame_index % n].send(job).is_err() {
                            break;
                        }
                        frame_index = frame_index.wrapping_add(1);
                    }
                    // Return the frame's surface to the (2-buffer) pool right
                    // away. Without this the free-threaded pool starves after a
                    // couple of frames and `TryGetNextFrame` returns `None`
                    // forever — capping throughput at ~1 fps regardless of how
                    // fast we encode.
                    let _ = frame.Close();
                    // Throttle to the requested fps after a successful frame.
                    let elapsed = started.elapsed();
                    if elapsed < frame_interval {
                        std::thread::sleep(frame_interval - elapsed);
                    }
                } else {
                    // No frame composed yet; poll again shortly.
                    std::thread::sleep(Duration::from_millis(5));
                }
            }

            // Drop the dispatch senders so the workers' input channels
            // disconnect and they exit; that drops their output senders so the
            // collector's ordered `recv` returns `Err` and it exits too. `stop`
            // then joins them all.
            inputs.clear();

            let _ = session.Close();
            let _ = pool.Close();
        }

        struct CaptureState {
            wgc: Wgc,
            pool: Direct3D11CaptureFramePool,
            session: GraphicsCaptureSession,
        }

        fn init_capture(target: &Target) -> Result<CaptureState, String> {
            let wgc = Wgc::new()?;
            let item = wgc.create_item(target)?;
            let size = item
                .Size()
                .map_err(|e| format!("capture item size query failed: {e}"))?;
            if size.Width <= 0 || size.Height <= 0 {
                return Err("capture item has zero size".into());
            }
            let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                &wgc.winrt_device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                2,
                size,
            )
            .map_err(|e| format!("frame pool creation failed: {e}"))?;
            let session = pool
                .CreateCaptureSession(&item)
                .map_err(|e| format!("capture session creation failed: {e}"))?;
            // Cursor visible for screenshare.
            let _ = session.SetIsCursorCaptureEnabled(true);
            // Win11-only; ignore failure on older Win10 builds.
            let _ = session.SetIsBorderRequired(false);
            session
                .StartCapture()
                .map_err(|e| format!("StartCapture failed: {e}"))?;
            Ok(CaptureState {
                wgc,
                pool,
                session,
            })
        }
    }

    /// Continuous WASAPI audio capture.
    ///
    /// Preferred path: **process loopback** (Win10 2004+) — captures either
    /// ONLY the shared window's process tree ("Capture app audio") or the
    /// whole system EXCLUDING our own process tree (desktop shares — device
    /// loopback would re-broadcast Fluxer's own voice playback as echo).
    /// Fallback: the default render endpoint's device loopback (whole system,
    /// echo included) on older Windows.
    mod audio {
        use crate::capture::AudioFormat;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::mpsc::Sender as StdSender;
        use std::sync::Arc;
        use std::time::Duration;
        use tokio::sync::broadcast;

        use windows::core::{implement, Interface, Ref, GUID};
        use windows::Win32::Foundation::{CloseHandle, HANDLE};
        use windows::Win32::Media::Audio::{
            eConsole, eRender, ActivateAudioInterfaceAsync,
            IActivateAudioInterfaceAsyncOperation, IActivateAudioInterfaceCompletionHandler,
            IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient,
            IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT,
            AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            AUDCLNT_STREAMFLAGS_LOOPBACK, AUDIOCLIENT_ACTIVATION_PARAMS,
            AUDIOCLIENT_ACTIVATION_PARAMS_0, AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
            PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
            PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
            WAVE_FORMAT_PCM,
        };
        use windows::Win32::Media::KernelStreaming::{
            KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE,
        };
        use windows::Win32::Media::Multimedia::{
            KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT,
        };
        use windows::Win32::System::Com::StructuredStorage::{
            PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, BLOB, CLSCTX_ALL,
            COINIT_MULTITHREADED,
        };
        use windows::Win32::System::Threading::{
            CreateEventW, GetCurrentProcessId, WaitForSingleObject,
        };
        use windows::Win32::System::Variant::VT_BLOB;

        /// Whose audio to capture.
        #[derive(Clone, Copy)]
        pub(super) enum AudioTarget {
            /// Whole system minus our own process tree (screen shares).
            ExcludeSelf,
            /// Only this process tree's audio (window shares — "app audio").
            IncludeProcess(u32),
        }

        /// Blocks `ActivateAudioInterfaceAsync`'s completion back onto the
        /// calling thread via a channel send.
        #[implement(IActivateAudioInterfaceCompletionHandler)]
        struct ActivationDone(StdSender<()>);

        impl IActivateAudioInterfaceCompletionHandler_Impl for ActivationDone_Impl {
            fn ActivateCompleted(
                &self,
                _op: Ref<'_, IActivateAudioInterfaceAsyncOperation>,
            ) -> windows::core::Result<()> {
                let _ = self.0.send(());
                Ok(())
            }
        }

        /// The concrete sample encoding of the render mix format.
        #[derive(Clone, Copy)]
        enum SampleKind {
            F32,
            I16,
        }

        struct MixInfo {
            sample_rate: u32,
            channels: u16,
            /// Retained for diagnostics / format documentation; the sample
            /// conversion is driven by `kind`, so this may be unread.
            #[allow(dead_code)]
            bits_per_sample: u16,
            kind: SampleKind,
        }

        /// Inspect a `WAVEFORMATEX` (possibly a `WAVEFORMATEXTENSIBLE`) and work
        /// out the PCM sample encoding. Reads packed fields into locals first
        /// (the struct is `#[repr(C, packed)]`).
        unsafe fn inspect_format(pfmt: *const WAVEFORMATEX) -> Option<MixInfo> {
            if pfmt.is_null() {
                return None;
            }
            let fmt = *pfmt;
            let tag = fmt.wFormatTag as u32;
            let channels = fmt.nChannels;
            let sample_rate = fmt.nSamplesPerSec;
            let bits = fmt.wBitsPerSample;
            let cb_size = fmt.cbSize;

            if channels == 0 || sample_rate == 0 || bits == 0 {
                return None;
            }

            let kind = if tag == WAVE_FORMAT_IEEE_FLOAT {
                if bits == 32 {
                    SampleKind::F32
                } else {
                    return None;
                }
            } else if tag == WAVE_FORMAT_PCM {
                if bits == 16 {
                    SampleKind::I16
                } else {
                    return None;
                }
            } else if tag == WAVE_FORMAT_EXTENSIBLE {
                if (cb_size as usize) < 22 {
                    return None;
                }
                let ext = pfmt as *const WAVEFORMATEXTENSIBLE;
                let sub: GUID = (*ext).SubFormat;
                if sub == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT && bits == 32 {
                    SampleKind::F32
                } else if sub == KSDATAFORMAT_SUBTYPE_PCM && bits == 16 {
                    SampleKind::I16
                } else {
                    return None;
                }
            } else {
                return None;
            };

            Some(MixInfo {
                sample_rate,
                channels,
                bits_per_sample: bits,
                kind,
            })
        }

        /// Convert a raw packet of `frames * channels` samples (in the source
        /// encoding) to interleaved 32-bit-float little-endian bytes.
        unsafe fn packet_to_f32_le(
            data: *const u8,
            frames: u32,
            channels: u16,
            kind: SampleKind,
        ) -> Vec<u8> {
            let total = frames as usize * channels as usize;
            let mut out = Vec::with_capacity(total * 4);
            match kind {
                SampleKind::F32 => {
                    // Already f32; copy through (the source is native-endian =
                    // little-endian on Windows/x86).
                    let src = data as *const f32;
                    for i in 0..total {
                        let v = *src.add(i);
                        out.extend_from_slice(&v.to_le_bytes());
                    }
                }
                SampleKind::I16 => {
                    let src = data as *const i16;
                    for i in 0..total {
                        let s = *src.add(i);
                        let v = (s as f32) / 32768.0;
                        out.extend_from_slice(&v.to_le_bytes());
                    }
                }
            }
            out
        }

        pub fn run(
            stop: Arc<AtomicBool>,
            audio_tx: broadcast::Sender<Arc<Vec<u8>>>,
            fmt_tx: StdSender<Option<AudioFormat>>,
            target: AudioTarget,
        ) {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }

            // Any failure here => report None (audio disabled) and bail.
            let state = match unsafe { init_audio(target) } {
                Ok(state) => state,
                Err(e) => {
                    tracing::warn!("WASAPI loopback init failed: {e}");
                    let _ = fmt_tx.send(None);
                    return;
                }
            };

            let AudioState {
                client,
                capture,
                info,
                event,
            } = state;

            let format = AudioFormat {
                sample_rate: info.sample_rate,
                channels: info.channels,
            };
            let _ = fmt_tx.send(Some(format));

            let channels = info.channels;
            let kind = info.kind;

            unsafe {
                'outer: while !stop.load(Ordering::SeqCst) {
                    // Process-loopback clients deliver via event callback; the
                    // device-loopback fallback is polled.
                    match event {
                        Some(handle) => {
                            let _ = WaitForSingleObject(handle, 200);
                        }
                        None => std::thread::sleep(Duration::from_millis(10)),
                    }

                    // Drain all currently-available packets.
                    loop {
                        let packet_size = match capture.GetNextPacketSize() {
                            Ok(n) => n,
                            Err(e) => {
                                tracing::warn!("GetNextPacketSize failed: {e}");
                                break 'outer;
                            }
                        };
                        if packet_size == 0 {
                            break;
                        }
                        let mut data: *mut u8 = std::ptr::null_mut();
                        let mut num_frames: u32 = 0;
                        let mut flags: u32 = 0;
                        if capture
                            .GetBuffer(&mut data, &mut num_frames, &mut flags, None, None)
                            .is_err()
                        {
                            break;
                        }
                        if num_frames > 0 {
                            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                                // Silence: skip rather than emit zeros.
                            } else if !data.is_null() {
                                let bytes = packet_to_f32_le(data, num_frames, channels, kind);
                                if !bytes.is_empty() {
                                    let _ = audio_tx.send(Arc::new(bytes));
                                }
                            }
                        }
                        let _ = capture.ReleaseBuffer(num_frames);
                    }
                }

                let _ = client.Stop();
                if let Some(handle) = event {
                    let _ = CloseHandle(handle);
                }
            }
        }

        struct AudioState {
            client: IAudioClient,
            capture: IAudioCaptureClient,
            info: MixInfo,
            /// Event handle when the client was initialized event-driven
            /// (process loopback). `None` = poll with a sleep.
            event: Option<HANDLE>,
        }

        unsafe fn init_audio(target: AudioTarget) -> Result<AudioState, String> {
            match init_process_loopback(target) {
                Ok(state) => Ok(state),
                Err(e) => {
                    tracing::warn!(
                        "process-loopback audio init failed ({e}); falling back to device \
                         loopback (own app audio will be audible in the share)"
                    );
                    init_device_loopback()
                }
            }
        }

        /// Fixed capture format for process loopback: its virtual device has
        /// no mix format to query, so WE pick one and the engine converts.
        const PL_SAMPLE_RATE: u32 = 48_000;
        const PL_CHANNELS: u16 = 2;

        /// WASAPI process loopback (Win10 2004+): capture audio of ONE process
        /// tree (window share) or everything EXCEPT ours (screen share).
        unsafe fn init_process_loopback(target: AudioTarget) -> Result<AudioState, String> {
            let (pid, mode) = match target {
                AudioTarget::IncludeProcess(pid) => {
                    (pid, PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE)
                }
                AudioTarget::ExcludeSelf => (
                    GetCurrentProcessId(),
                    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
                ),
            };

            let params = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: pid,
                        ProcessLoopbackMode: mode,
                    },
                },
            };
            // The params ride in a VT_BLOB PROPVARIANT; `params` must stay
            // alive until activation completes (we block on the channel below
            // within this scope, so it does).
            //
            // CRITICAL: keep the PROPVARIANT in ManuallyDrop and never drop
            // it. windows-rs's PROPVARIANT runs PropVariantClear on Drop,
            // which CoTaskMemFree's the blob pointer — but ours points at the
            // STACK `params` above, so dropping it corrupts the heap
            // (observed as STATUS_HEAP_CORRUPTION). The PROPVARIANT owns no
            // heap allocation, so skipping its drop leaks nothing.
            let prop = std::mem::ManuallyDrop::new(PROPVARIANT {
                Anonymous: PROPVARIANT_0 {
                    Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                        vt: VT_BLOB,
                        wReserved1: 0,
                        wReserved2: 0,
                        wReserved3: 0,
                        Anonymous: PROPVARIANT_0_0_0 {
                            blob: BLOB {
                                cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>()
                                    as u32,
                                pBlobData: &params as *const _ as *mut u8,
                            },
                        },
                    }),
                },
            });

            let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
            let handler: IActivateAudioInterfaceCompletionHandler =
                ActivationDone(done_tx).into();
            let op = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&*prop),
                &handler,
            )
            .map_err(|e| format!("ActivateAudioInterfaceAsync failed: {e}"))?;
            done_rx
                .recv_timeout(Duration::from_secs(3))
                .map_err(|_| "audio interface activation timed out".to_string())?;

            let mut activate_hr = windows::core::HRESULT(0);
            let mut unknown: Option<windows::core::IUnknown> = None;
            op.GetActivateResult(&mut activate_hr, &mut unknown)
                .map_err(|e| format!("GetActivateResult failed: {e}"))?;
            activate_hr
                .ok()
                .map_err(|e| format!("audio interface activation failed: {e}"))?;
            let client: IAudioClient = unknown
                .ok_or_else(|| "activation yielded no audio client".to_string())?
                .cast()
                .map_err(|e| format!("IAudioClient cast failed: {e}"))?;

            let format = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
                nChannels: PL_CHANNELS,
                nSamplesPerSec: PL_SAMPLE_RATE,
                nAvgBytesPerSec: PL_SAMPLE_RATE * PL_CHANNELS as u32 * 4,
                nBlockAlign: PL_CHANNELS * 4,
                wBitsPerSample: 32,
                cbSize: 0,
            };
            client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                    200_000, // 20 ms
                    0,
                    &format,
                    None,
                )
                .map_err(|e| format!("process-loopback Initialize failed: {e}"))?;

            let event = CreateEventW(None, false, false, None)
                .map_err(|e| format!("CreateEventW failed: {e}"))?;
            client
                .SetEventHandle(event)
                .map_err(|e| format!("SetEventHandle failed: {e}"))?;
            let capture: IAudioCaptureClient = client
                .GetService()
                .map_err(|e| format!("GetService(IAudioCaptureClient) failed: {e}"))?;
            client
                .Start()
                .map_err(|e| format!("IAudioClient::Start failed: {e}"))?;

            Ok(AudioState {
                client,
                capture,
                info: MixInfo {
                    sample_rate: PL_SAMPLE_RATE,
                    channels: PL_CHANNELS,
                    bits_per_sample: 32,
                    kind: SampleKind::F32,
                },
                event: Some(event),
            })
        }

        /// Legacy fallback: loopback on the default render endpoint (captures
        /// the WHOLE system mix, including our own playback).
        unsafe fn init_device_loopback() -> Result<AudioState, String> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("CoCreateInstance(MMDeviceEnumerator) failed: {e}"))?;

            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("GetDefaultAudioEndpoint failed: {e}"))?;

            let client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("IMMDevice::Activate<IAudioClient> failed: {e}"))?;

            let mix_ptr = client
                .GetMixFormat()
                .map_err(|e| format!("GetMixFormat failed: {e}"))?;

            let info = inspect_format(mix_ptr);

            // Initialise in shared loopback mode with a ~200ms buffer. 1 hns
            // unit = 100ns, so 200ms = 200 * 10_000 = 2_000_000 hns.
            let buffer_duration: i64 = 2_000_000;
            let init_result = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                buffer_duration,
                0,
                mix_ptr,
                None,
            );

            // The mix format is owned by us now; free it once done reading.
            if !mix_ptr.is_null() {
                CoTaskMemFree(Some(mix_ptr as *const core::ffi::c_void));
            }

            init_result.map_err(|e| format!("IAudioClient::Initialize failed: {e}"))?;

            let info = info.ok_or_else(|| "unsupported mix format".to_string())?;

            let capture: IAudioCaptureClient = client
                .GetService()
                .map_err(|e| format!("GetService(IAudioCaptureClient) failed: {e}"))?;

            client
                .Start()
                .map_err(|e| format!("IAudioClient::Start failed: {e}"))?;

            Ok(AudioState {
                client,
                capture,
                info,
                event: None,
            })
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// Interactive-desktop test: the continuous WGC capture loop actually
    /// produces JPEG video frames (not just compiles). Run manually:
    /// `cargo test -p fluxer-desktop -- --ignored continuous_video`
    #[test]
    #[ignore]
    fn continuous_video_produces_jpeg_frames() {
        start("screen:0:0", 15, 1280, false).expect("start capture");
        let mut rx = subscribe_video().expect("video subscription");
        let mut frame = None;
        // Poll up to ~4s for the first frame.
        for _ in 0..80 {
            match rx.try_recv() {
                Ok(f) => {
                    frame = Some(f);
                    break;
                }
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(50)),
            }
        }
        stop();
        let f = frame.expect("no video frame received within ~4s");
        assert!(f.len() > 500, "frame implausibly small: {} bytes", f.len());
        // JPEG SOI marker (falls back to raw-with-header only if encode fails).
        assert!(
            f[0] == 0xFF && f[1] == 0xD8,
            "expected JPEG (FF D8), got {:02x} {:02x}",
            f[0],
            f[1]
        );
    }

    /// Throughput benchmark for the PARALLEL encode pool. The capture pipeline
    /// now downscales + JPEG-encodes off the capture loop across N worker
    /// threads (N = same clamp used by the pool), so aggregate throughput is
    /// ~N× a single thread's ~33 fps. This benchmark reproduces that math
    /// directly (no WGC/desktop needed): it spawns N threads, each encoding the
    /// synthetic 1920×1080 BGRA frame in a tight loop for ~1.5 s, sums frames
    /// across threads, and reports aggregate fps + per-thread ms/frame.
    ///
    /// IMPORTANT: run in RELEASE. The SIMD JPEG encoder + `image` downscale are
    /// an order of magnitude slower unoptimized, so a debug run measures
    /// rustc's `-O0`, not the pipeline:
    /// `cargo test -p fluxer-desktop --release -- --ignored --nocapture measure_encode_throughput`
    #[test]
    #[ignore]
    fn measure_encode_throughput() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        use std::time::{Duration, Instant};

        // Same worker count the runtime pool picks.
        let n = std::thread::available_parallelism()
            .map(|c| c.get().saturating_sub(1))
            .unwrap_or(3)
            .clamp(2, 4);

        // Synthetic 1080p BGRA frame with per-pixel variation (a flat frame
        // encodes unrealistically fast). Shared read-only across workers.
        let w: u32 = 1920;
        let h: u32 = 1080;
        let frame: Arc<Vec<u8>> = Arc::new({
            let mut buf = vec![0u8; (w * h * 4) as usize];
            for (i, px) in buf.chunks_exact_mut(4).enumerate() {
                px[0] = (i & 0xFF) as u8; // B
                px[1] = ((i >> 8) & 0xFF) as u8; // G
                px[2] = ((i >> 4) & 0xFF) as u8; // R
                px[3] = 0xFF; // A
            }
            buf
        });

        let run = Arc::new(AtomicBool::new(true));
        let duration = Duration::from_millis(1500);

        // Warm the encoder path once (first-touch/codepath init) off the clock.
        {
            let (dw, dh, dbgra) =
                super::windows_impl::video::maybe_downscale(w, h, (*frame).clone(), 1920);
            let _ = super::windows_impl::video::encode_frame(dw, dh, &dbgra);
        }

        let started = Instant::now();
        let mut handles = Vec::with_capacity(n);
        for _ in 0..n {
            let frame = frame.clone();
            let run = run.clone();
            handles.push(std::thread::spawn(move || {
                let mut count: u64 = 0;
                let mut first_was_jpeg: Option<bool> = None;
                while run.load(Ordering::Relaxed) {
                    // Mirror the worker's exact steps: downscale (no-op at
                    // 1920 target => still exercises the path) then encode.
                    let (dw, dh, dbgra) = super::windows_impl::video::maybe_downscale(
                        w,
                        h,
                        (*frame).clone(),
                        1920,
                    );
                    let out = super::windows_impl::video::encode_frame(dw, dh, &dbgra);
                    if first_was_jpeg.is_none() {
                        first_was_jpeg =
                            Some(out.len() >= 2 && out[0] == 0xFF && out[1] == 0xD8);
                    }
                    count += 1;
                }
                (count, first_was_jpeg)
            }));
        }

        std::thread::sleep(duration);
        run.store(false, Ordering::Relaxed);

        let mut total: u64 = 0;
        let mut jpeg_ok = true;
        for handle in handles {
            let (count, was_jpeg) = handle.join().expect("encode thread panicked");
            total += count;
            jpeg_ok &= was_jpeg.unwrap_or(false);
        }
        let elapsed = started.elapsed().as_secs_f64();

        let agg_fps = total as f64 / elapsed;
        // Per-thread ms/frame = wall time / frames-per-thread (avg).
        let per_thread_frames = total as f64 / n as f64;
        let ms_per_frame = if per_thread_frames > 0.0 {
            (elapsed * 1000.0) / per_thread_frames
        } else {
            0.0
        };
        eprintln!(
            "measure_encode_throughput: {n} workers, {total} frames in {elapsed:.2}s \
             => aggregate {agg_fps:.1} fps, {ms_per_frame:.1} ms/frame/thread \
             (JPEG FF D8: {jpeg_ok})"
        );

        assert!(jpeg_ok, "expected JPEG (FF D8) output from encode path");
        assert!(
            agg_fps > 50.0,
            "expected aggregate > 50 fps from {n}-worker pool, got {agg_fps:.1}"
        );
    }

    /// Interactive-desktop test: WASAPI loopback starts and reports a sane PCM
    /// format. Audio init may legitimately be absent on a headless/no-endpoint
    /// box; when present, the format must be valid.
    /// `cargo test -p fluxer-desktop -- --ignored audio_loopback`
    #[test]
    #[ignore]
    fn audio_loopback_reports_sane_format() {
        start("screen:0:0", 15, 640, true).expect("start capture");
        let sub = subscribe_audio();
        stop();
        if let Some((fmt, _rx)) = sub {
            assert!(
                (8_000..=384_000).contains(&fmt.sample_rate),
                "bad sample rate {}",
                fmt.sample_rate
            );
            assert!(
                (1..=8).contains(&fmt.channels),
                "bad channel count {}",
                fmt.channels
            );
        }
    }
}

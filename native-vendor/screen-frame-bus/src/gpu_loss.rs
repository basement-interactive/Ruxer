// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::StagingBackend;
use fluxer_gpu_rebuild::{GpuLossCallback, GpuRebuildError};

pub const MIN_STAGING_BYTES: u64 = 1;
pub const MAX_STAGING_BYTES: u64 = 1 << 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WgpuStagingConfig {
    pub byte_len: u64,
}

impl WgpuStagingConfig {
    pub fn new(byte_len: u64) -> Self {
        assert!(byte_len >= MIN_STAGING_BYTES, "byte_len must be positive");
        assert!(byte_len <= MAX_STAGING_BYTES, "byte_len exceeds sanity cap");
        Self { byte_len }
    }
}

struct WgpuStagingResources {
    buffer: wgpu::Buffer,
    cpu_mirror: Vec<u8>,
    ready: bool,
}

pub struct WgpuStagingBackend {
    config: WgpuStagingConfig,
    resources: Option<WgpuStagingResources>,
}

impl WgpuStagingBackend {
    pub fn new(device: &wgpu::Device, config: WgpuStagingConfig) -> Self {
        assert!(config.byte_len >= MIN_STAGING_BYTES, "config min invariant");
        assert!(config.byte_len <= MAX_STAGING_BYTES, "config max invariant");
        let resources = build_resources(device, config);
        Self {
            config,
            resources: Some(resources),
        }
    }

    pub fn new_unbuilt(config: WgpuStagingConfig) -> Self {
        assert!(config.byte_len >= MIN_STAGING_BYTES, "config min invariant");
        assert!(config.byte_len <= MAX_STAGING_BYTES, "config max invariant");
        Self {
            config,
            resources: None,
        }
    }

    pub fn config(&self) -> WgpuStagingConfig {
        assert!(
            self.config.byte_len >= MIN_STAGING_BYTES,
            "config min invariant"
        );
        assert!(
            self.config.byte_len <= MAX_STAGING_BYTES,
            "config max invariant"
        );
        self.config
    }

    pub fn is_built(&self) -> bool {
        let built = self.resources.is_some();
        assert!(
            self.config.byte_len >= MIN_STAGING_BYTES,
            "config min while introspecting"
        );
        assert!(
            self.config.byte_len <= MAX_STAGING_BYTES,
            "config max while introspecting"
        );
        built
    }

    pub fn buffer(&self) -> Option<&wgpu::Buffer> {
        let buf = self.resources.as_ref().map(|r| &r.buffer);
        assert_eq!(
            buf.is_some(),
            self.is_built(),
            "buffer presence must align with built state",
        );
        buf
    }
}

impl StagingBackend for WgpuStagingBackend {
    fn write<F: FnOnce(&mut [u8])>(&mut self, fill: F) {
        let Some(resources) = self.resources.as_mut() else {
            return;
        };
        fill(&mut resources.cpu_mirror);
        resources.ready = true;
    }

    fn read<R, F: FnOnce(&[u8]) -> R>(&self, read: F) -> R {
        let empty: &[u8] = &[];
        match self.resources.as_ref() {
            Some(r) => read(&r.cpu_mirror),
            None => read(empty),
        }
    }

    fn is_ready(&self) -> bool {
        match self.resources.as_ref() {
            Some(r) => r.ready,
            None => false,
        }
    }

    fn is_idle(&self) -> bool {
        match self.resources.as_ref() {
            Some(r) => !r.ready,
            None => true,
        }
    }
}

impl GpuLossCallback for WgpuStagingBackend {
    fn release(&mut self) {
        assert!(
            self.config.byte_len >= MIN_STAGING_BYTES,
            "release config min invariant"
        );
        assert!(
            self.config.byte_len <= MAX_STAGING_BYTES,
            "release config max invariant"
        );
        self.resources = None;
        assert!(!self.is_built(), "release postcondition: must be unbuilt");
    }

    fn rebuild(
        &mut self,
        device: &wgpu::Device,
        _queue: &wgpu::Queue,
    ) -> Result<(), GpuRebuildError> {
        assert!(
            self.config.byte_len >= MIN_STAGING_BYTES,
            "rebuild config min invariant"
        );
        assert!(
            self.config.byte_len <= MAX_STAGING_BYTES,
            "rebuild config max invariant"
        );
        if self.resources.is_some() {
            return Err(GpuRebuildError::OwnerInvariantBroken {
                reason: "rebuild without prior release",
            });
        }
        let resources = build_resources(device, self.config);
        self.resources = Some(resources);
        assert!(self.is_built(), "rebuild postcondition: must be built");
        Ok(())
    }

    fn is_ready(&self) -> bool {
        self.is_built()
    }

    fn debug_label(&self) -> &'static str {
        "screen_frame_bus.wgpu_staging_backend"
    }
}

fn build_resources(device: &wgpu::Device, config: WgpuStagingConfig) -> WgpuStagingResources {
    assert!(
        config.byte_len >= MIN_STAGING_BYTES,
        "build_resources min invariant"
    );
    assert!(
        config.byte_len <= MAX_STAGING_BYTES,
        "build_resources max invariant"
    );
    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("screen_frame_bus.wgpu_staging_buffer"),
        size: config.byte_len,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let cpu_mirror = vec![0u8; config.byte_len as usize];
    assert_eq!(
        cpu_mirror.len() as u64,
        config.byte_len,
        "cpu mirror must match configured byte len",
    );
    WgpuStagingResources {
        buffer,
        cpu_mirror,
        ready: false,
    }
}

pub fn try_acquire_device() -> Option<(wgpu::Device, wgpu::Queue, wgpu::Instance)> {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::all() | wgpu::Backends::SECONDARY;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = pollster_block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::default(),
        force_fallback_adapter: false,
        compatible_surface: None,
    }))
    .ok()?;
    let device_result = pollster_block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("screen_frame_bus.wgpu_staging_backend.test_device"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::default(),
        memory_hints: wgpu::MemoryHints::default(),
        trace: wgpu::Trace::Off,
        experimental_features: wgpu::ExperimentalFeatures::default(),
    }));
    match device_result {
        Ok((device, queue)) => Some((device, queue, instance)),
        Err(_) => None,
    }
}

fn pollster_block_on<F: core::future::Future>(fut: F) -> F::Output {
    futures_executor_block_on(fut)
}

fn futures_executor_block_on<F: core::future::Future>(mut fut: F) -> F::Output {
    use core::pin::Pin;
    use core::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};
    fn raw_waker() -> RawWaker {
        fn no_op(_: *const ()) {}
        fn clone(_: *const ()) -> RawWaker {
            raw_waker()
        }
        static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, no_op, no_op, no_op);
        RawWaker::new(core::ptr::null(), &VTABLE)
    }
    let waker = unsafe { Waker::from_raw(raw_waker()) };
    let mut cx = Context::from_waker(&waker);
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(out) => return out,
            Poll::Pending => continue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CpuStagingBackend, STAGING_PAIR_LEN, StagingSurfacePair};
    use fluxer_gpu_rebuild::{GpuLossRegistry, RebuildOutcome};

    struct GpuCtx {
        device: wgpu::Device,
        queue: wgpu::Queue,
        _instance: wgpu::Instance,
    }

    fn gpu_ctx() -> Option<GpuCtx> {
        let acquired = std::panic::catch_unwind(std::panic::AssertUnwindSafe(try_acquire_device));
        let (device, queue, instance) = match acquired {
            Ok(Some(triple)) => triple,
            Ok(None) => return None,
            Err(_) => return None,
        };
        Some(GpuCtx {
            device,
            queue,
            _instance: instance,
        })
    }

    #[test]
    fn staging_backend_is_ready_only_when_built() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let cfg = WgpuStagingConfig::new(256);
        let mut backend = WgpuStagingBackend::new(&ctx.device, cfg);
        assert!(
            GpuLossCallback::is_ready(&backend),
            "freshly built backend must be ready",
        );
        backend.release();
        assert!(
            !GpuLossCallback::is_ready(&backend),
            "released backend must not be ready",
        );
        let outcome = backend.rebuild(&ctx.device, &ctx.queue);
        assert!(outcome.is_ok(), "rebuild on fresh device must succeed");
        assert!(
            GpuLossCallback::is_ready(&backend),
            "rebuilt backend must be ready",
        );
    }

    #[test]
    fn registry_handles_staging_backend_round_trip() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let registry = GpuLossRegistry::new();
        let backend = Box::new(WgpuStagingBackend::new(
            &ctx.device,
            WgpuStagingConfig::new(128),
        ));
        let _guard = registry.register(backend);
        let report = registry.handle_device_lost(&ctx.device, &ctx.queue);
        assert_eq!(report.released_count, 1);
        assert_eq!(report.rebuilt_count, 1);
        assert_eq!(report.failed_count, 0);
        assert!(report.is_total_success());
    }

    #[test]
    fn double_rebuild_without_release_is_owner_invariant_error() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let mut backend = WgpuStagingBackend::new(&ctx.device, WgpuStagingConfig::new(64));
        let outcome = backend.rebuild(&ctx.device, &ctx.queue);
        assert!(matches!(
            outcome,
            Err(GpuRebuildError::OwnerInvariantBroken { .. })
        ));
    }

    #[test]
    fn write_between_release_and_rebuild_is_a_noop_and_not_ready() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let mut backend = WgpuStagingBackend::new(&ctx.device, WgpuStagingConfig::new(64));
        backend.release();
        backend.write(|buf| buf.fill(0xAA));
        assert!(
            !<WgpuStagingBackend as StagingBackend>::is_ready(&backend),
            "write before rebuild must not flip ready",
        );
        let observed = backend.read(|buf| buf.len());
        assert_eq!(observed, 0, "read before rebuild must observe empty mirror");
    }

    #[test]
    fn surface_pair_with_wgpu_backend_round_trips_cpu_mirror() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let cfg = WgpuStagingConfig::new(64);
        let a = WgpuStagingBackend::new(&ctx.device, cfg);
        let b = WgpuStagingBackend::new(&ctx.device, cfg);
        assert_eq!(
            STAGING_PAIR_LEN, 2,
            "OBS staging pair is exactly two surfaces"
        );
        let mut pair: StagingSurfacePair<WgpuStagingBackend> = StagingSurfacePair::new([a, b]);
        pair.submit(0, |buf| {
            buf[0] = 0xDE;
            buf[1] = 0xAD;
        })
        .expect("submit zero must succeed");
        pair.submit(1, |buf| {
            buf[0] = 0xBE;
            buf[1] = 0xEF;
        })
        .expect("submit one must succeed");
        let first = pair
            .try_map(0, |buf| (buf[0], buf[1]))
            .expect("map zero ready");
        assert_eq!(first, (0xDE, 0xAD));
        let second = pair
            .try_map(1, |buf| (buf[0], buf[1]))
            .expect("map one ready");
        assert_eq!(second, (0xBE, 0xEF));
    }

    #[test]
    fn registry_holds_mixed_packers_and_staging_backends() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let registry = GpuLossRegistry::new();
        let mut guards = Vec::new();
        for i in 0..4u32 {
            let bytes = 32u64 << (i % 4);
            let backend = Box::new(WgpuStagingBackend::new(
                &ctx.device,
                WgpuStagingConfig::new(bytes),
            ));
            guards.push(registry.register(backend));
        }
        let report = registry.handle_device_lost(&ctx.device, &ctx.queue);
        assert_eq!(report.released_count, 4);
        assert_eq!(report.rebuilt_count, 4);
        assert_eq!(report.failed_count, 0);
        for outcome in &report.outcomes {
            assert!(matches!(outcome, RebuildOutcome::Rebuilt { .. }));
        }
        drop(guards);
    }

    #[test]
    fn cpu_backend_still_works_alongside_wgpu_backend() {
        let cpu = CpuStagingBackend::new(64);
        assert!(<CpuStagingBackend as StagingBackend>::is_idle(&cpu));
        assert!(<CpuStagingBackend as StagingBackend>::is_ready(&cpu));
    }

    #[test]
    fn buffer_handle_disappears_after_release_and_reappears_after_rebuild() {
        let Some(ctx) = gpu_ctx() else {
            eprintln!("screen-frame-bus gpu_loss: no wgpu adapter, skipping");
            return;
        };
        let mut backend = WgpuStagingBackend::new(&ctx.device, WgpuStagingConfig::new(128));
        assert!(backend.buffer().is_some(), "buffer present after build");
        backend.release();
        assert!(backend.buffer().is_none(), "buffer absent after release");
        backend
            .rebuild(&ctx.device, &ctx.queue)
            .expect("rebuild must succeed");
        assert!(backend.buffer().is_some(), "buffer present after rebuild");
    }
}

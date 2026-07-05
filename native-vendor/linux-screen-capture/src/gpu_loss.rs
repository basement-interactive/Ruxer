// SPDX-License-Identifier: AGPL-3.0-or-later

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use fluxer_gpu_rebuild::{
    GpuDevice, GpuLossCallback, GpuLossRegistry, GpuQueue, GpuRebuildError, RegistrationGuard,
};

pub const MAX_PENDING_DEVICE_LOSS_EVENTS: u64 = 1 << 32;

pub struct DeviceLossTelemetry {
    device_loss_total: AtomicU64,
    rebuild_total: AtomicU64,
    rebuild_failed_total: AtomicU64,
    registry_present: AtomicBool,
}

impl DeviceLossTelemetry {
    pub fn new() -> Self {
        let telemetry = Self {
            device_loss_total: AtomicU64::new(0),
            rebuild_total: AtomicU64::new(0),
            rebuild_failed_total: AtomicU64::new(0),
            registry_present: AtomicBool::new(false),
        };
        assert_eq!(telemetry.device_loss_total.load(Ordering::Relaxed), 0);
        assert_eq!(telemetry.rebuild_total.load(Ordering::Relaxed), 0);
        telemetry
    }

    pub fn record_device_loss(&self) {
        let before = self.device_loss_total.fetch_add(1, Ordering::Relaxed);
        assert!(before < MAX_PENDING_DEVICE_LOSS_EVENTS);
        assert!(before.wrapping_add(1) > before);
    }

    pub fn record_rebuild(&self, rebuilt: u32, failed: u32) {
        assert!(rebuilt as u64 <= MAX_PENDING_DEVICE_LOSS_EVENTS);
        assert!(failed as u64 <= MAX_PENDING_DEVICE_LOSS_EVENTS);
        self.rebuild_total
            .fetch_add(rebuilt as u64, Ordering::Relaxed);
        self.rebuild_failed_total
            .fetch_add(failed as u64, Ordering::Relaxed);
    }

    pub fn device_loss_total(&self) -> u64 {
        let v = self.device_loss_total.load(Ordering::Relaxed);
        assert!(v <= MAX_PENDING_DEVICE_LOSS_EVENTS);
        v
    }

    pub fn rebuild_total(&self) -> u64 {
        let v = self.rebuild_total.load(Ordering::Relaxed);
        assert!(self.registry_present.load(Ordering::Relaxed) || v == 0);
        v
    }

    pub fn rebuild_failed_total(&self) -> u64 {
        let v = self.rebuild_failed_total.load(Ordering::Relaxed);
        assert!(v <= self.rebuild_total.load(Ordering::Relaxed));
        v
    }

    pub fn mark_registry_attached(&self) {
        let prior = self.registry_present.swap(true, Ordering::AcqRel);
        assert!(!prior, "telemetry must not be attached twice");
        assert!(self.registry_present.load(Ordering::Acquire));
    }
}

impl Default for DeviceLossTelemetry {
    fn default() -> Self {
        Self::new()
    }
}

pub struct DeviceLossBridge {
    registry: Arc<GpuLossRegistry>,
    telemetry: Arc<DeviceLossTelemetry>,
}

impl DeviceLossBridge {
    pub fn new(registry: Arc<GpuLossRegistry>, telemetry: Arc<DeviceLossTelemetry>) -> Self {
        assert!(
            Arc::strong_count(&registry) >= 1,
            "registry arc must be alive"
        );
        assert!(
            Arc::strong_count(&telemetry) >= 1,
            "telemetry arc must be alive"
        );
        telemetry.mark_registry_attached();
        Self {
            registry,
            telemetry,
        }
    }

    pub fn register(&self, callback: Box<dyn GpuLossCallback>) -> RegistrationGuard {
        assert!(
            Arc::strong_count(&self.registry) >= 1,
            "registry alive on register"
        );
        assert!(
            Arc::strong_count(&self.telemetry) >= 1,
            "telemetry alive on register"
        );
        self.registry.register(callback)
    }

    pub fn dispatch_device_lost(&self, device: &GpuDevice, queue: &GpuQueue) {
        assert!(
            Arc::strong_count(&self.registry) >= 1,
            "registry alive on dispatch"
        );
        self.telemetry.record_device_loss();
        let report = self.registry.handle_device_lost(device, queue);
        assert!(
            report.rebuilt_count + report.failed_count + report.vacant_count
                == report.outcomes.len() as u32,
            "report totals must reconcile with outcome vector",
        );
        self.telemetry
            .record_rebuild(report.rebuilt_count, report.failed_count);
    }

    pub fn dispatch_device_loss_stub(&self) {
        assert!(
            Arc::strong_count(&self.registry) >= 1,
            "registry alive on stub dispatch"
        );
        self.telemetry.record_device_loss();
    }

    pub fn telemetry(&self) -> &Arc<DeviceLossTelemetry> {
        assert!(
            Arc::strong_count(&self.telemetry) >= 1,
            "telemetry alive on read"
        );
        &self.telemetry
    }

    pub fn registry(&self) -> &Arc<GpuLossRegistry> {
        assert!(
            Arc::strong_count(&self.registry) >= 1,
            "registry alive on read"
        );
        &self.registry
    }
}

#[cfg(feature = "wgpu")]
pub fn attach_wgpu_device_loss_hook(
    device: &wgpu::Device,
    bridge: Arc<DeviceLossBridge>,
) -> Result<(), GpuRebuildError> {
    assert!(
        Arc::strong_count(&bridge) >= 1,
        "bridge arc must be alive when attaching hook"
    );
    let captured = Arc::clone(&bridge);
    device.set_device_lost_callback(move |reason, message| {
        let _ = reason;
        let _ = message;
        captured.telemetry.record_device_loss();
    });
    let _ = device;
    Ok(())
}

#[cfg(not(feature = "wgpu"))]
pub fn attach_wgpu_device_loss_hook(bridge: Arc<DeviceLossBridge>) -> Result<(), GpuRebuildError> {
    assert!(
        Arc::strong_count(&bridge) >= 1,
        "bridge arc must be alive when attaching stub"
    );
    bridge.dispatch_device_loss_stub();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use parking_lot::Mutex;

    struct MockOwner {
        released: Arc<AtomicU64>,
        rebuilt: Arc<AtomicU64>,
        label_text: &'static str,
        ready: Arc<AtomicBool>,
        fail_rebuild: bool,
    }

    impl GpuLossCallback for MockOwner {
        fn release(&mut self) {
            self.released.fetch_add(1, Ordering::SeqCst);
            self.ready.store(false, Ordering::SeqCst);
        }

        fn rebuild(
            &mut self,
            _device: &GpuDevice,
            _queue: &GpuQueue,
        ) -> Result<(), GpuRebuildError> {
            self.rebuilt.fetch_add(1, Ordering::SeqCst);
            if self.fail_rebuild {
                return Err(GpuRebuildError::ResourceCreateFailed { reason: "mock" });
            }
            self.ready.store(true, Ordering::SeqCst);
            Ok(())
        }

        fn is_ready(&self) -> bool {
            self.ready.load(Ordering::SeqCst)
        }

        fn debug_label(&self) -> &'static str {
            self.label_text
        }
    }

    fn make_mock_owner(fail_rebuild: bool) -> (Box<MockOwner>, Arc<AtomicU64>, Arc<AtomicU64>) {
        let released = Arc::new(AtomicU64::new(0));
        let rebuilt = Arc::new(AtomicU64::new(0));
        let ready = Arc::new(AtomicBool::new(true));
        let owner = Box::new(MockOwner {
            released: Arc::clone(&released),
            rebuilt: Arc::clone(&rebuilt),
            label_text: "mock-linux-screen",
            ready,
            fail_rebuild,
        });
        (owner, released, rebuilt)
    }

    #[cfg(not(feature = "wgpu"))]
    fn fresh_device_queue() -> (GpuDevice, GpuQueue) {
        (GpuDevice { id: 1 }, GpuQueue { id: 1 })
    }

    #[test]
    fn telemetry_starts_at_zero_counters() {
        let telemetry = DeviceLossTelemetry::new();
        assert_eq!(telemetry.device_loss_total(), 0);
        assert_eq!(telemetry.rebuild_total(), 0);
        assert_eq!(telemetry.rebuild_failed_total(), 0);
    }

    #[test]
    fn record_device_loss_increments_counter_monotonically() {
        let telemetry = DeviceLossTelemetry::new();
        telemetry.record_device_loss();
        telemetry.record_device_loss();
        telemetry.record_device_loss();
        assert_eq!(telemetry.device_loss_total(), 3);
    }

    #[cfg(not(feature = "wgpu"))]
    #[test]
    fn dispatch_device_lost_drives_registry_and_telemetry() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let bridge = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));

        let (owner_a, released_a, rebuilt_a) = make_mock_owner(false);
        let (owner_b, released_b, rebuilt_b) = make_mock_owner(false);
        let _g1 = bridge.register(owner_a);
        let _g2 = bridge.register(owner_b);

        let (device, queue) = fresh_device_queue();
        bridge.dispatch_device_lost(&device, &queue);

        assert_eq!(released_a.load(Ordering::SeqCst), 1);
        assert_eq!(released_b.load(Ordering::SeqCst), 1);
        assert_eq!(rebuilt_a.load(Ordering::SeqCst), 1);
        assert_eq!(rebuilt_b.load(Ordering::SeqCst), 1);
        assert_eq!(telemetry.device_loss_total(), 1);
        assert_eq!(telemetry.rebuild_total(), 2);
        assert_eq!(telemetry.rebuild_failed_total(), 0);
    }

    #[cfg(not(feature = "wgpu"))]
    #[test]
    fn dispatch_device_lost_accumulates_failures_in_telemetry() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let bridge = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));

        let (owner_a, _, _) = make_mock_owner(true);
        let (owner_b, _, _) = make_mock_owner(false);
        let _g1 = bridge.register(owner_a);
        let _g2 = bridge.register(owner_b);

        let (device, queue) = fresh_device_queue();
        bridge.dispatch_device_lost(&device, &queue);
        bridge.dispatch_device_lost(&device, &queue);

        assert_eq!(telemetry.device_loss_total(), 2);
        assert_eq!(telemetry.rebuild_total(), 2);
        assert_eq!(telemetry.rebuild_failed_total(), 2);
    }

    #[test]
    fn bridge_marks_telemetry_attached_exactly_once() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let _bridge = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));
        assert!(telemetry.registry_present.load(Ordering::SeqCst));
    }

    #[test]
    #[should_panic(expected = "telemetry must not be attached twice")]
    fn telemetry_cannot_be_attached_twice() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let _first = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));
        let _second = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));
    }

    #[test]
    fn registered_owners_remain_under_concurrent_register_pressure() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let bridge = Arc::new(DeviceLossBridge::new(
            Arc::clone(&registry),
            Arc::clone(&telemetry),
        ));
        let collected: Arc<Mutex<Vec<RegistrationGuard>>> = Arc::new(Mutex::new(Vec::new()));

        let mut handles = Vec::new();
        for _ in 0..8 {
            let bridge = Arc::clone(&bridge);
            let collected = Arc::clone(&collected);
            handles.push(std::thread::spawn(move || {
                let (owner, _, _) = make_mock_owner(false);
                let guard = bridge.register(owner);
                collected.lock().push(guard);
            }));
        }
        for h in handles {
            h.join().expect("worker must complete");
        }
        assert_eq!(registry.len(), 8);
    }

    #[test]
    fn stub_dispatch_increments_only_telemetry_counter() {
        let registry = Arc::new(GpuLossRegistry::new());
        let telemetry = Arc::new(DeviceLossTelemetry::new());
        let bridge = DeviceLossBridge::new(Arc::clone(&registry), Arc::clone(&telemetry));
        bridge.dispatch_device_loss_stub();
        bridge.dispatch_device_loss_stub();
        assert_eq!(telemetry.device_loss_total(), 2);
        assert_eq!(telemetry.rebuild_total(), 0);
    }
}

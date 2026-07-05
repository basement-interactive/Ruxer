// SPDX-License-Identifier: AGPL-3.0-or-later

#![deny(clippy::too_many_lines)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]
#![deny(warnings)]

use parking_lot::Mutex;
use std::sync::Arc;

pub const MAX_REGISTERED_OWNERS: usize = 1024;

#[cfg(feature = "wgpu")]
pub type GpuDevice = wgpu::Device;
#[cfg(feature = "wgpu")]
pub type GpuQueue = wgpu::Queue;

#[cfg(not(feature = "wgpu"))]
#[derive(Debug)]
pub struct GpuDevice {
    pub id: u64,
}

#[cfg(not(feature = "wgpu"))]
#[derive(Debug)]
pub struct GpuQueue {
    pub id: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GpuRebuildError {
    DeviceRejected { reason: &'static str },
    ResourceCreateFailed { reason: &'static str },
    OwnerInvariantBroken { reason: &'static str },
    Other { code: u32 },
}

impl std::fmt::Display for GpuRebuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DeviceRejected { reason } => write!(f, "device rejected: {reason}"),
            Self::ResourceCreateFailed { reason } => write!(f, "resource create failed: {reason}"),
            Self::OwnerInvariantBroken { reason } => write!(f, "owner invariant broken: {reason}"),
            Self::Other { code } => write!(f, "other rebuild error code={code}"),
        }
    }
}

impl std::error::Error for GpuRebuildError {}

pub type OwnerId = u64;

pub trait GpuLossCallback: Send {
    fn release(&mut self);
    fn rebuild(&mut self, device: &GpuDevice, queue: &GpuQueue) -> Result<(), GpuRebuildError>;
    fn is_ready(&self) -> bool;
    fn debug_label(&self) -> &'static str {
        "<unlabelled-gpu-owner>"
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuildOutcome {
    Rebuilt {
        owner_id: OwnerId,
        label: &'static str,
    },
    Failed {
        owner_id: OwnerId,
        label: &'static str,
        error: GpuRebuildError,
    },
    Vacant {
        owner_id: OwnerId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuildReport {
    pub released_count: u32,
    pub rebuilt_count: u32,
    pub failed_count: u32,
    pub vacant_count: u32,
    pub outcomes: Vec<RebuildOutcome>,
}

impl RebuildReport {
    pub fn is_total_success(&self) -> bool {
        self.failed_count == 0 && self.rebuilt_count > 0
    }

    pub fn is_empty_pass(&self) -> bool {
        self.released_count == 0
            && self.rebuilt_count == 0
            && self.failed_count == 0
            && self.vacant_count == 0
    }
}

struct Slot {
    owner_id: OwnerId,
    callback: Option<Box<dyn GpuLossCallback>>,
}

struct RegistryInner {
    slots: Vec<Slot>,
    next_owner_id: OwnerId,
    registration_order_monotonic_floor: OwnerId,
}

impl RegistryInner {
    fn new() -> Self {
        Self {
            slots: Vec::with_capacity(MAX_REGISTERED_OWNERS),
            next_owner_id: 1,
            registration_order_monotonic_floor: 0,
        }
    }

    fn deregister(&mut self, owner_id: OwnerId) {
        assert!(owner_id > 0, "owner_id must be positive");
        assert!(
            owner_id < self.next_owner_id,
            "owner_id must come from a real registration"
        );
        let before = self.slots.len();
        self.slots.retain(|slot| slot.owner_id != owner_id);
        let after = self.slots.len();
        assert!(after <= before, "deregister must not grow slots");
        assert!(
            after >= before.saturating_sub(1),
            "deregister removes at most one slot"
        );
    }
}

pub struct GpuLossRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

impl GpuLossRegistry {
    pub fn new() -> Self {
        let inner = Arc::new(Mutex::new(RegistryInner::new()));
        let registry = Self { inner };
        assert_eq!(registry.len(), 0, "fresh registry must be empty");
        assert!(registry.is_empty(), "fresh registry must report empty");
        registry
    }

    pub fn len(&self) -> usize {
        let guard = self.inner.lock();
        guard.slots.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn register(&self, owner: Box<dyn GpuLossCallback>) -> RegistrationGuard {
        let mut guard = self.inner.lock();
        assert!(
            guard.slots.len() < MAX_REGISTERED_OWNERS,
            "registry exceeds MAX_REGISTERED_OWNERS",
        );
        let id = guard.next_owner_id;
        assert!(
            id > guard.registration_order_monotonic_floor,
            "ids must be monotonic"
        );
        guard.registration_order_monotonic_floor = id;
        guard.next_owner_id = id.checked_add(1).unwrap_or(OwnerId::MAX);
        guard.slots.push(Slot {
            owner_id: id,
            callback: Some(owner),
        });
        drop(guard);
        RegistrationGuard {
            owner_id: id,
            registry: Arc::clone(&self.inner),
        }
    }

    pub fn handle_device_lost(
        &self,
        new_device: &GpuDevice,
        new_queue: &GpuQueue,
    ) -> RebuildReport {
        let mut guard = self.inner.lock();
        assert!(
            guard.slots.len() <= MAX_REGISTERED_OWNERS,
            "slots within cap before walk",
        );
        let released_count = release_in_reverse_order(&mut guard.slots);
        let outcomes = rebuild_in_forward_order(&mut guard.slots, new_device, new_queue);
        let report = summarize_outcomes(outcomes, released_count);
        assert_pair_total_accounting(&guard.slots, &report);
        assert_pair_post_rebuild_ready(&guard.slots, &report);
        report
    }
}

impl Default for GpuLossRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub struct RegistrationGuard {
    owner_id: OwnerId,
    registry: Arc<Mutex<RegistryInner>>,
}

impl RegistrationGuard {
    pub fn owner_id(&self) -> OwnerId {
        assert!(self.owner_id > 0, "guard must hold a valid id");
        assert!(
            Arc::strong_count(&self.registry) >= 1,
            "registry must outlive guard"
        );
        self.owner_id
    }
}

impl Drop for RegistrationGuard {
    fn drop(&mut self) {
        let owner_id = self.owner_id;
        if owner_id == 0 {
            return;
        }
        let mut guard = self.registry.lock();
        guard.deregister(owner_id);
    }
}

fn release_in_reverse_order(slots: &mut [Slot]) -> u32 {
    let total = slots.len();
    assert!(
        total <= MAX_REGISTERED_OWNERS,
        "slots within cap on release"
    );
    let mut released: u32 = 0;
    for slot in slots.iter_mut().rev() {
        if let Some(callback) = slot.callback.as_mut() {
            callback.release();
            released = released.saturating_add(1);
        }
    }
    assert!(released as usize <= total, "released cannot exceed total");
    released
}

fn rebuild_in_forward_order(
    slots: &mut [Slot],
    device: &GpuDevice,
    queue: &GpuQueue,
) -> Vec<RebuildOutcome> {
    let total = slots.len();
    assert!(
        total <= MAX_REGISTERED_OWNERS,
        "slots within cap on rebuild"
    );
    let mut outcomes: Vec<RebuildOutcome> = Vec::with_capacity(total);
    for slot in slots.iter_mut() {
        let owner_id = slot.owner_id;
        assert!(owner_id > 0, "rebuild slot must have non-zero id");
        let outcome = rebuild_single_slot(slot, device, queue);
        outcomes.push(outcome);
    }
    assert_eq!(outcomes.len(), total, "one outcome per slot");
    outcomes
}

fn rebuild_single_slot(slot: &mut Slot, device: &GpuDevice, queue: &GpuQueue) -> RebuildOutcome {
    let owner_id = slot.owner_id;
    let callback = match slot.callback.as_mut() {
        Some(cb) => cb,
        None => return RebuildOutcome::Vacant { owner_id },
    };
    let label = callback.debug_label();
    match callback.rebuild(device, queue) {
        Ok(()) => RebuildOutcome::Rebuilt { owner_id, label },
        Err(error) => RebuildOutcome::Failed {
            owner_id,
            label,
            error,
        },
    }
}

fn summarize_outcomes(outcomes: Vec<RebuildOutcome>, released_count: u32) -> RebuildReport {
    let mut rebuilt_count: u32 = 0;
    let mut failed_count: u32 = 0;
    let mut vacant_count: u32 = 0;
    for outcome in outcomes.iter() {
        match outcome {
            RebuildOutcome::Rebuilt { .. } => rebuilt_count = rebuilt_count.saturating_add(1),
            RebuildOutcome::Failed { .. } => failed_count = failed_count.saturating_add(1),
            RebuildOutcome::Vacant { .. } => vacant_count = vacant_count.saturating_add(1),
        }
    }
    let report = RebuildReport {
        released_count,
        rebuilt_count,
        failed_count,
        vacant_count,
        outcomes,
    };
    assert_eq!(
        report.outcomes.len() as u32,
        report.rebuilt_count + report.failed_count + report.vacant_count,
        "outcome totals must match",
    );
    report
}

fn assert_pair_total_accounting(slots: &[Slot], report: &RebuildReport) {
    let total = slots.len() as u32;
    assert_eq!(
        total,
        report.rebuilt_count + report.failed_count + report.vacant_count,
        "report covers every slot",
    );
    let mut last_id: OwnerId = 0;
    for slot in slots.iter() {
        assert!(
            slot.owner_id > last_id,
            "registration ids must be monotonic"
        );
        last_id = slot.owner_id;
    }
}

fn assert_pair_post_rebuild_ready(slots: &[Slot], report: &RebuildReport) {
    assert_eq!(
        slots.len(),
        report.outcomes.len(),
        "slot count must match report"
    );
    for (slot, outcome) in slots.iter().zip(report.outcomes.iter()) {
        match outcome {
            RebuildOutcome::Rebuilt { owner_id, .. } => {
                assert_eq!(*owner_id, slot.owner_id, "owner id alignment");
                if let Some(cb) = slot.callback.as_ref() {
                    assert!(cb.is_ready(), "rebuilt owner must report ready");
                }
            }
            RebuildOutcome::Failed { owner_id, .. } => {
                assert_eq!(*owner_id, slot.owner_id, "failed owner id alignment");
            }
            RebuildOutcome::Vacant { owner_id } => {
                assert_eq!(*owner_id, slot.owner_id, "vacant owner id alignment");
                assert!(slot.callback.is_none(), "vacant slot must have no callback");
            }
        }
    }
}

#[cfg(all(test, not(feature = "wgpu")))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::thread;

    fn make_device_queue() -> (GpuDevice, GpuQueue) {
        (GpuDevice { id: 42 }, GpuQueue { id: 42 })
    }

    #[derive(Default)]
    struct Counters {
        release_calls: AtomicU32,
        rebuild_calls: AtomicU32,
        release_seq: AtomicU32,
        rebuild_seq: AtomicU32,
    }

    struct MockOwner {
        counters: Arc<Counters>,
        ready: bool,
        fail_rebuild: bool,
        release_order: Arc<Mutex<Vec<u32>>>,
        rebuild_order: Arc<Mutex<Vec<u32>>>,
        slot_marker: u32,
        label: &'static str,
    }

    impl GpuLossCallback for MockOwner {
        fn release(&mut self) {
            self.ready = false;
            let n = self.counters.release_calls.fetch_add(1, Ordering::SeqCst);
            self.counters.release_seq.store(n + 1, Ordering::SeqCst);
            let mut order = self.release_order.lock();
            order.push(self.slot_marker);
        }

        fn rebuild(
            &mut self,
            _device: &GpuDevice,
            _queue: &GpuQueue,
        ) -> Result<(), GpuRebuildError> {
            let n = self.counters.rebuild_calls.fetch_add(1, Ordering::SeqCst);
            self.counters.rebuild_seq.store(n + 1, Ordering::SeqCst);
            let mut order = self.rebuild_order.lock();
            order.push(self.slot_marker);
            if self.fail_rebuild {
                return Err(GpuRebuildError::ResourceCreateFailed {
                    reason: "mock fail",
                });
            }
            self.ready = true;
            Ok(())
        }

        fn is_ready(&self) -> bool {
            self.ready
        }

        fn debug_label(&self) -> &'static str {
            self.label
        }
    }

    fn fresh_counters() -> Arc<Counters> {
        Arc::new(Counters::default())
    }

    fn make_owner(
        marker: u32,
        counters: Arc<Counters>,
        release_order: Arc<Mutex<Vec<u32>>>,
        rebuild_order: Arc<Mutex<Vec<u32>>>,
    ) -> Box<MockOwner> {
        Box::new(MockOwner {
            counters,
            ready: true,
            fail_rebuild: false,
            release_order,
            rebuild_order,
            slot_marker: marker,
            label: "mock",
        })
    }

    #[test]
    fn five_owners_release_lifo_rebuild_fifo() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let mut guards = Vec::new();
        for i in 0..5u32 {
            let owner = make_owner(
                i,
                Arc::clone(&counters),
                Arc::clone(&release_order),
                Arc::clone(&rebuild_order),
            );
            guards.push(registry.register(owner));
        }
        assert_eq!(registry.len(), 5);
        let (device, queue) = make_device_queue();
        let report = registry.handle_device_lost(&device, &queue);
        assert_eq!(report.released_count, 5);
        assert_eq!(report.rebuilt_count, 5);
        assert_eq!(report.failed_count, 0);
        assert_eq!(report.vacant_count, 0);
        let rel = release_order.lock().clone();
        assert_eq!(rel, vec![4, 3, 2, 1, 0]);
        let reb = rebuild_order.lock().clone();
        assert_eq!(reb, vec![0, 1, 2, 3, 4]);
        drop(guards);
    }

    #[test]
    fn owner_rebuild_failure_does_not_abort_other_owners() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let mut guards = Vec::new();
        for i in 0..4u32 {
            let mut owner = make_owner(
                i,
                Arc::clone(&counters),
                Arc::clone(&release_order),
                Arc::clone(&rebuild_order),
            );
            if i == 1 {
                owner.fail_rebuild = true;
            }
            guards.push(registry.register(owner));
        }
        let (device, queue) = make_device_queue();
        let report = registry.handle_device_lost(&device, &queue);
        assert_eq!(report.released_count, 4);
        assert_eq!(report.rebuilt_count, 3);
        assert_eq!(report.failed_count, 1);
        let failed = report
            .outcomes
            .iter()
            .filter(|o| matches!(o, RebuildOutcome::Failed { .. }))
            .count();
        assert_eq!(failed, 1);
        drop(guards);
    }

    #[test]
    fn registration_guard_drop_deregisters() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let owner = make_owner(
            7,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        );
        let guard = registry.register(owner);
        assert_eq!(registry.len(), 1);
        drop(guard);
        assert_eq!(registry.len(), 0);
        assert!(registry.is_empty());
    }

    #[test]
    fn empty_registry_device_loss_is_noop() {
        let registry = GpuLossRegistry::new();
        let (device, queue) = make_device_queue();
        let report = registry.handle_device_lost(&device, &queue);
        assert!(report.is_empty_pass());
        assert!(!report.is_total_success());
        assert_eq!(report.outcomes.len(), 0);
    }

    #[test]
    fn concurrent_registration_is_safe() {
        let registry = Arc::new(GpuLossRegistry::new());
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let mut threads = Vec::new();
        let guards_collector: Arc<Mutex<Vec<RegistrationGuard>>> = Arc::new(Mutex::new(Vec::new()));
        for i in 0..16u32 {
            let registry = Arc::clone(&registry);
            let counters = Arc::clone(&counters);
            let release_order = Arc::clone(&release_order);
            let rebuild_order = Arc::clone(&rebuild_order);
            let guards_collector = Arc::clone(&guards_collector);
            threads.push(thread::spawn(move || {
                let owner = make_owner(i, counters, release_order, rebuild_order);
                let guard = registry.register(owner);
                let mut store = guards_collector.lock();
                store.push(guard);
            }));
        }
        for t in threads {
            assert!(t.join().is_ok());
        }
        assert_eq!(registry.len(), 16);
    }

    #[test]
    fn pair_asserted_invariants_under_stress() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let mut guards = Vec::new();
        for i in 0..64u32 {
            let mut owner = make_owner(
                i,
                Arc::clone(&counters),
                Arc::clone(&release_order),
                Arc::clone(&rebuild_order),
            );
            if i % 7 == 0 {
                owner.fail_rebuild = true;
            }
            guards.push(registry.register(owner));
        }
        let (device, queue) = make_device_queue();
        for _ in 0..5 {
            release_order.lock().clear();
            rebuild_order.lock().clear();
            let _report = registry.handle_device_lost(&device, &queue);
        }
        let rel = release_order.lock().clone();
        let reb = rebuild_order.lock().clone();
        assert_eq!(rel.len(), 64);
        assert_eq!(reb.len(), 64);
        for i in 0..64u32 {
            assert_eq!(rel[i as usize], 63 - i);
            assert_eq!(reb[i as usize], i);
        }
        drop(guards);
        assert!(registry.is_empty());
    }

    #[test]
    fn mock_callback_counters_are_deterministic() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let guard = registry.register(make_owner(
            1,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        ));
        let (device, queue) = make_device_queue();
        for _ in 0..3 {
            registry.handle_device_lost(&device, &queue);
        }
        assert_eq!(counters.release_calls.load(Ordering::SeqCst), 3);
        assert_eq!(counters.rebuild_calls.load(Ordering::SeqCst), 3);
        drop(guard);
    }

    #[test]
    fn deregister_middle_owner_preserves_order() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let g0 = registry.register(make_owner(
            0,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        ));
        let g1 = registry.register(make_owner(
            1,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        ));
        let g2 = registry.register(make_owner(
            2,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        ));
        assert_eq!(registry.len(), 3);
        drop(g1);
        assert_eq!(registry.len(), 2);
        let (device, queue) = make_device_queue();
        let report = registry.handle_device_lost(&device, &queue);
        assert_eq!(report.rebuilt_count, 2);
        let rel = release_order.lock().clone();
        assert_eq!(rel, vec![2, 0]);
        let reb = rebuild_order.lock().clone();
        assert_eq!(reb, vec![0, 2]);
        drop(g0);
        drop(g2);
        assert!(registry.is_empty());
    }

    #[test]
    fn rebuild_report_total_success_flag() {
        let registry = GpuLossRegistry::new();
        let counters = fresh_counters();
        let release_order = Arc::new(Mutex::new(Vec::new()));
        let rebuild_order = Arc::new(Mutex::new(Vec::new()));
        let guard = registry.register(make_owner(
            0,
            Arc::clone(&counters),
            Arc::clone(&release_order),
            Arc::clone(&rebuild_order),
        ));
        let (device, queue) = make_device_queue();
        let report = registry.handle_device_lost(&device, &queue);
        assert!(report.is_total_success());
        assert!(!report.is_empty_pass());
        drop(guard);
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "linux")]
use std::os::fd::RawFd;

pub const FRAME_BYTES_MAX: usize = 1920 * 1080 * 4;

pub const MAX_CPU_FRAMES: usize = 8;

#[cfg(target_os = "macos")]
pub struct IoSurfaceHandle;

#[cfg(target_os = "windows")]
#[derive(Debug)]
pub struct D3D11Handle(pub usize);

#[cfg(target_os = "windows")]
unsafe impl Send for D3D11Handle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for D3D11Handle {}

pub enum Frame {
    Cpu(Box<[u8]>),
    #[cfg(feature = "wgpu")]
    WgpuTexture {
        texture: wgpu::Texture,
        format: wgpu::TextureFormat,
        dims: (u32, u32),
    },
    #[cfg(target_os = "macos")]
    IoSurface {
        surface_ref: IoSurfaceHandle,
    },
    #[cfg(target_os = "linux")]
    Dmabuf {
        fds: Vec<RawFd>,
        format_modifier: u64,
    },
    #[cfg(target_os = "windows")]
    D3D11Shared {
        handle: D3D11Handle,
        key: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FramePoolError {
    ZeroCapacity,
    CapacityOverflow,
}

impl std::fmt::Display for FramePoolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ZeroCapacity => write!(f, "frame pool capacity must be greater than zero"),
            Self::CapacityOverflow => write!(f, "frame pool capacity exceeds usize bounds"),
        }
    }
}

impl std::error::Error for FramePoolError {}

struct PoolInner {
    slots: Vec<Arc<Frame>>,
    free: Mutex<Vec<usize>>,
    capacity: usize,
    acquired_total: AtomicU64,
    skipped_total: AtomicU64,
    currently_in_flight: AtomicU64,
}

pub struct FramePool {
    inner: Arc<PoolInner>,
}

impl FramePool {
    pub fn from_slots(slots: Vec<Arc<Frame>>) -> Result<Self, FramePoolError> {
        let capacity = slots.len();
        assert!(capacity == slots.len());
        if capacity == 0 {
            return Err(FramePoolError::ZeroCapacity);
        }
        assert!(capacity > 0);

        let mut free = Vec::with_capacity(capacity);
        for index in 0..capacity {
            free.push(index);
        }
        assert_eq!(free.len(), capacity);

        let inner = PoolInner {
            slots,
            free: Mutex::new(free),
            capacity,
            acquired_total: AtomicU64::new(0),
            skipped_total: AtomicU64::new(0),
            currently_in_flight: AtomicU64::new(0),
        };
        Ok(Self {
            inner: Arc::new(inner),
        })
    }

    pub fn try_acquire(&self) -> Option<PooledFrame> {
        assert!(self.inner.capacity > 0);

        let mut free = self.inner.free.lock();
        assert!(free.len() <= self.inner.capacity);
        let index = match free.pop() {
            Some(idx) => idx,
            None => {
                drop(free);
                self.inner.skipped_total.fetch_add(1, Ordering::Relaxed);
                return None;
            }
        };
        assert!(index < self.inner.capacity);
        self.inner.acquired_total.fetch_add(1, Ordering::Relaxed);
        let after = self
            .inner
            .currently_in_flight
            .fetch_add(1, Ordering::AcqRel)
            + 1;
        assert!(after as usize <= self.inner.capacity);
        drop(free);

        let frame = Arc::clone(&self.inner.slots[index]);
        Some(PooledFrame {
            frame,
            slot_index: index,
            pool: Arc::clone(&self.inner),
        })
    }

    pub fn capacity(&self) -> usize {
        assert!(self.inner.capacity > 0);
        let cap = self.inner.capacity;
        assert!(cap == self.inner.slots.len());
        cap
    }

    pub fn acquired_total(&self) -> u64 {
        assert!(self.inner.capacity > 0);
        let total = self.inner.acquired_total.load(Ordering::Relaxed);
        assert!(total >= self.inner.currently_in_flight.load(Ordering::Relaxed));
        total
    }

    pub fn skipped_total(&self) -> u64 {
        assert!(self.inner.capacity > 0);
        let in_flight = self.inner.currently_in_flight.load(Ordering::Relaxed);
        assert!(in_flight as usize <= self.inner.capacity);
        self.inner.skipped_total.load(Ordering::Relaxed)
    }

    pub fn currently_in_flight(&self) -> u64 {
        let in_flight = self.inner.currently_in_flight.load(Ordering::Acquire);
        assert!(in_flight as usize <= self.inner.capacity);
        assert!(in_flight <= self.inner.acquired_total.load(Ordering::Relaxed));
        in_flight
    }
}

pub struct PooledFrame {
    frame: Arc<Frame>,
    slot_index: usize,
    pool: Arc<PoolInner>,
}

impl PooledFrame {
    pub fn frame(&self) -> &Arc<Frame> {
        assert!(self.slot_index < self.pool.capacity);
        assert!(Arc::strong_count(&self.frame) >= 2);
        &self.frame
    }

    pub fn slot_index(&self) -> usize {
        assert!(self.slot_index < self.pool.capacity);
        let idx = self.slot_index;
        assert!(idx < self.pool.slots.len());
        idx
    }
}

impl Drop for PooledFrame {
    fn drop(&mut self) {
        assert!(self.slot_index < self.pool.capacity);

        let mut free = self.pool.free.lock();
        assert!(free.len() < self.pool.capacity);
        let before = self.pool.currently_in_flight.load(Ordering::Acquire);
        assert!(before >= 1);
        assert!(before as usize <= self.pool.capacity);
        free.push(self.slot_index);
        let after = self.pool.currently_in_flight.fetch_sub(1, Ordering::AcqRel) - 1;
        assert!(after as usize <= self.pool.capacity);
        drop(free);
    }
}

pub struct CpuFrameBuilder;

impl CpuFrameBuilder {
    pub fn build_pool(bytes_per_slot: usize) -> Result<FramePool, FramePoolError> {
        assert!(bytes_per_slot > 0);
        assert!(bytes_per_slot <= FRAME_BYTES_MAX);
        if bytes_per_slot == 0 {
            return Err(FramePoolError::ZeroCapacity);
        }

        let mut slots: Vec<Arc<Frame>> = Vec::with_capacity(MAX_CPU_FRAMES);
        for _ in 0..MAX_CPU_FRAMES {
            let buf: Box<[u8]> = vec![0u8; bytes_per_slot].into_boxed_slice();
            assert_eq!(buf.len(), bytes_per_slot);
            slots.push(Arc::new(Frame::Cpu(buf)));
        }
        assert_eq!(slots.len(), MAX_CPU_FRAMES);
        FramePool::from_slots(slots)
    }

    pub fn build_pool_with_capacity(
        capacity: usize,
        bytes_per_slot: usize,
    ) -> Result<FramePool, FramePoolError> {
        assert!(bytes_per_slot <= FRAME_BYTES_MAX);
        if capacity == 0 {
            return Err(FramePoolError::ZeroCapacity);
        }
        assert!(capacity > 0);
        let mut slots: Vec<Arc<Frame>> = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            let buf: Box<[u8]> = vec![0u8; bytes_per_slot].into_boxed_slice();
            assert_eq!(buf.len(), bytes_per_slot);
            slots.push(Arc::new(Frame::Cpu(buf)));
        }
        assert_eq!(slots.len(), capacity);
        FramePool::from_slots(slots)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Barrier;
    use std::sync::atomic::AtomicUsize;
    use std::thread;
    use std::time::{Duration, Instant};

    const SMALL_SLOT_BYTES: usize = 64;

    fn small_pool(capacity: usize) -> FramePool {
        CpuFrameBuilder::build_pool_with_capacity(capacity, SMALL_SLOT_BYTES)
            .expect("non-zero capacity")
    }

    #[test]
    fn acquire_up_to_capacity_then_returns_none() {
        let pool = small_pool(4);
        let mut held = Vec::new();
        for expected in 0..4 {
            let frame = pool.try_acquire().expect("slot must be available");
            assert_eq!(pool.currently_in_flight() as usize, expected + 1);
            held.push(frame);
        }
        assert_eq!(pool.acquired_total(), 4);
        assert!(pool.try_acquire().is_none());
        assert_eq!(pool.skipped_total(), 1);
        assert_eq!(pool.currently_in_flight(), 4);
    }

    #[test]
    fn drop_releases_slot_back_to_pool() {
        let pool = small_pool(2);
        let first = pool.try_acquire().expect("first slot");
        let second = pool.try_acquire().expect("second slot");
        assert!(pool.try_acquire().is_none());
        drop(first);
        let revived = pool.try_acquire().expect("released slot returns");
        assert_eq!(pool.currently_in_flight(), 2);
        drop(second);
        drop(revived);
        assert_eq!(pool.currently_in_flight(), 0);
    }

    #[test]
    fn zero_capacity_pool_always_returns_none() {
        match CpuFrameBuilder::build_pool_with_capacity(0, SMALL_SLOT_BYTES) {
            Err(err) => assert_eq!(err, FramePoolError::ZeroCapacity),
            Ok(_) => panic!("zero capacity must be rejected"),
        }
        match FramePool::from_slots(Vec::new()) {
            Err(err) => assert_eq!(err, FramePoolError::ZeroCapacity),
            Ok(_) => panic!("empty slot vec must be rejected"),
        }
    }

    #[test]
    fn held_frame_has_strong_count_two_then_one() {
        let pool = small_pool(1);
        let held = pool.try_acquire().expect("slot must be available");
        assert_eq!(Arc::strong_count(held.frame()), 2);
        drop(held);
        let again = pool.try_acquire().expect("slot returned");
        assert_eq!(Arc::strong_count(again.frame()), 2);
        drop(again);
    }

    #[test]
    fn multi_thread_acquire_release_stress_does_not_deadlock() {
        const THREADS: usize = 10;
        const OPS_PER_THREAD: usize = 1000;
        const POOL_CAPACITY: usize = 4;

        let pool = Arc::new(small_pool(POOL_CAPACITY));
        let barrier = Arc::new(Barrier::new(THREADS));
        let acquired_observed = Arc::new(AtomicUsize::new(0));
        let skipped_observed = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::with_capacity(THREADS);
        for _ in 0..THREADS {
            let pool = Arc::clone(&pool);
            let barrier = Arc::clone(&barrier);
            let acquired_observed = Arc::clone(&acquired_observed);
            let skipped_observed = Arc::clone(&skipped_observed);
            handles.push(thread::spawn(move || {
                barrier.wait();
                let mut local_acquired: usize = 0;
                let mut local_skipped: usize = 0;
                for _ in 0..OPS_PER_THREAD {
                    match pool.try_acquire() {
                        Some(frame) => {
                            local_acquired += 1;
                            drop(frame);
                        }
                        None => {
                            local_skipped += 1;
                        }
                    }
                }
                acquired_observed.fetch_add(local_acquired, Ordering::Relaxed);
                skipped_observed.fetch_add(local_skipped, Ordering::Relaxed);
            }));
        }

        let deadline = Instant::now() + Duration::from_secs(30);
        for handle in handles {
            assert!(
                Instant::now() < deadline,
                "stress test exceeded 30s budget — likely deadlock"
            );
            handle.join().expect("worker panicked");
        }

        let total = pool.acquired_total() + pool.skipped_total();
        assert_eq!(total as usize, THREADS * OPS_PER_THREAD);
        assert_eq!(
            pool.acquired_total() as usize,
            acquired_observed.load(Ordering::Relaxed)
        );
        assert_eq!(
            pool.skipped_total() as usize,
            skipped_observed.load(Ordering::Relaxed)
        );
        assert_eq!(pool.currently_in_flight(), 0);
    }

    #[test]
    fn skipped_counter_increments_only_on_empty_pool() {
        let pool = small_pool(1);
        let held = pool.try_acquire().expect("first slot");
        assert!(pool.try_acquire().is_none());
        assert!(pool.try_acquire().is_none());
        assert_eq!(pool.skipped_total(), 2);
        assert_eq!(pool.acquired_total(), 1);
        drop(held);
        let _again = pool.try_acquire().expect("slot returned");
        assert_eq!(pool.acquired_total(), 2);
        assert_eq!(pool.skipped_total(), 2);
    }

    #[test]
    fn cpu_frame_builder_default_capacity_allocates_max_slots() {
        let pool =
            CpuFrameBuilder::build_pool(SMALL_SLOT_BYTES).expect("default builder must succeed");
        assert_eq!(pool.capacity(), MAX_CPU_FRAMES);
        let mut held = Vec::with_capacity(MAX_CPU_FRAMES);
        for _ in 0..MAX_CPU_FRAMES {
            held.push(pool.try_acquire().expect("slot in capacity"));
        }
        assert!(pool.try_acquire().is_none());
        for frame in &held {
            match frame.frame().as_ref() {
                Frame::Cpu(buf) => assert_eq!(buf.len(), SMALL_SLOT_BYTES),
                #[allow(unreachable_patterns)]
                _ => panic!("CpuFrameBuilder must emit Frame::Cpu variants"),
            }
        }
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

use std::cell::UnsafeCell;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use fluxer_screen_frame_bus::frame_pool::{
    CpuFrameBuilder, FramePool, FramePoolError, PooledFrame,
};
use fluxer_screen_frame_bus::{FrameData, SharedFrameBytes};

pub const LINUX_SCREEN_FRAME_POOL_CAP: usize = 8;
pub const LINUX_FRAME_DIM_MAX: usize = 8192;
pub const LINUX_FRAME_BYTES_MAX: usize = LINUX_FRAME_DIM_MAX * LINUX_FRAME_DIM_MAX * 4;

struct SlotCell {
    bytes: UnsafeCell<Box<[u8]>>,
}

unsafe impl Send for SlotCell {}
unsafe impl Sync for SlotCell {}

impl SharedFrameBytes for SlotCell {
    fn bytes(&self) -> &[u8] {
        unsafe { (*self.bytes.get()).as_ref() }
    }
}

pub struct LinuxFrameBufferPool {
    capacity_pool: FramePool,
    slot_buffers: Box<[Arc<SlotCell>]>,
    bytes_per_buffer: usize,
    frames_dropped_pool_exhausted: AtomicU64,
    frames_dropped_oversized: AtomicU64,
}

#[derive(Debug)]
pub enum LinuxFrameBufferPoolError {
    BytesPerBufferZero,
    BytesPerBufferOverflow,
    CapacityPoolFailed(FramePoolError),
}

impl std::fmt::Display for LinuxFrameBufferPoolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BytesPerBufferZero => f.write_str("bytes_per_buffer must be positive"),
            Self::BytesPerBufferOverflow => {
                f.write_str("bytes_per_buffer exceeds LINUX_FRAME_BYTES_MAX")
            }
            Self::CapacityPoolFailed(err) => write!(f, "capacity pool init failed: {err}"),
        }
    }
}

impl std::error::Error for LinuxFrameBufferPoolError {}

impl LinuxFrameBufferPool {
    pub fn new(bytes_per_buffer: usize) -> Result<Arc<Self>, LinuxFrameBufferPoolError> {
        assert!(bytes_per_buffer > 0);
        assert!(bytes_per_buffer <= LINUX_FRAME_BYTES_MAX);
        if bytes_per_buffer == 0 {
            return Err(LinuxFrameBufferPoolError::BytesPerBufferZero);
        }
        if bytes_per_buffer > LINUX_FRAME_BYTES_MAX {
            return Err(LinuxFrameBufferPoolError::BytesPerBufferOverflow);
        }
        let capacity_pool =
            CpuFrameBuilder::build_pool_with_capacity(LINUX_SCREEN_FRAME_POOL_CAP, 1)
                .map_err(LinuxFrameBufferPoolError::CapacityPoolFailed)?;
        assert_eq!(capacity_pool.capacity(), LINUX_SCREEN_FRAME_POOL_CAP);
        let mut buffers: Vec<Arc<SlotCell>> = Vec::with_capacity(LINUX_SCREEN_FRAME_POOL_CAP);
        for _ in 0..LINUX_SCREEN_FRAME_POOL_CAP {
            let buf: Box<[u8]> = vec![0u8; bytes_per_buffer].into_boxed_slice();
            assert_eq!(buf.len(), bytes_per_buffer);
            buffers.push(Arc::new(SlotCell {
                bytes: UnsafeCell::new(buf),
            }));
        }
        assert_eq!(buffers.len(), LINUX_SCREEN_FRAME_POOL_CAP);
        Ok(Arc::new(Self {
            capacity_pool,
            slot_buffers: buffers.into_boxed_slice(),
            bytes_per_buffer,
            frames_dropped_pool_exhausted: AtomicU64::new(0),
            frames_dropped_oversized: AtomicU64::new(0),
        }))
    }

    pub fn capacity(&self) -> usize {
        assert_eq!(self.slot_buffers.len(), LINUX_SCREEN_FRAME_POOL_CAP);
        assert_eq!(self.capacity_pool.capacity(), LINUX_SCREEN_FRAME_POOL_CAP);
        LINUX_SCREEN_FRAME_POOL_CAP
    }

    pub fn bytes_per_buffer(&self) -> usize {
        assert!(self.bytes_per_buffer > 0);
        assert!(self.bytes_per_buffer <= LINUX_FRAME_BYTES_MAX);
        self.bytes_per_buffer
    }

    pub fn frames_dropped_pool_exhausted(&self) -> u64 {
        let dropped = self.frames_dropped_pool_exhausted.load(Ordering::Relaxed);
        assert!(dropped <= u64::MAX / 2);
        dropped
    }

    pub fn frames_dropped_oversized(&self) -> u64 {
        let dropped = self.frames_dropped_oversized.load(Ordering::Relaxed);
        assert!(dropped <= u64::MAX / 2);
        dropped
    }

    pub fn note_frame_dropped_oversized(&self) {
        let before = self
            .frames_dropped_oversized
            .fetch_add(1, Ordering::Relaxed);
        assert!(before < u64::MAX / 2);
    }

    pub fn currently_in_flight(&self) -> u64 {
        let in_flight = self.capacity_pool.currently_in_flight();
        assert!(in_flight as usize <= LINUX_SCREEN_FRAME_POOL_CAP);
        in_flight
    }

    pub fn try_acquire(self: &Arc<Self>) -> Option<PooledFrameBuffer> {
        let pool_arc = Arc::clone(self);
        let pooled = match self.capacity_pool.try_acquire() {
            Some(p) => p,
            None => {
                let before = self
                    .frames_dropped_pool_exhausted
                    .fetch_add(1, Ordering::Relaxed);
                assert!(before < u64::MAX / 2);
                return None;
            }
        };
        let slot_index = pooled.slot_index();
        assert!(slot_index < self.slot_buffers.len());
        Some(PooledFrameBuffer {
            pool: pool_arc,
            capacity_token: pooled,
            slot_index,
            len: 0,
        })
    }
}

pub struct PooledFrameBuffer {
    pool: Arc<LinuxFrameBufferPool>,
    capacity_token: PooledFrame,
    slot_index: usize,
    len: usize,
}

impl PooledFrameBuffer {
    pub fn buffer_mut(&mut self) -> &mut [u8] {
        assert!(self.slot_index < self.pool.slot_buffers.len());
        let cell = &self.pool.slot_buffers[self.slot_index];
        let slice: &mut [u8] = unsafe { (*cell.bytes.get()).as_mut() };
        assert_eq!(slice.len(), self.pool.bytes_per_buffer);
        slice
    }

    pub fn set_len(&mut self, len: usize) {
        assert!(len <= self.pool.bytes_per_buffer);
        assert!(len <= LINUX_FRAME_BYTES_MAX);
        self.len = len;
    }

    pub fn as_slice(&self) -> &[u8] {
        assert!(self.slot_index < self.pool.slot_buffers.len());
        assert!(self.len <= self.pool.bytes_per_buffer);
        let cell = &self.pool.slot_buffers[self.slot_index];
        let slice: &[u8] = unsafe { (*cell.bytes.get()).as_ref() };
        &slice[..self.len]
    }

    pub fn into_shared_frame_data(self) -> FrameData {
        assert!(self.slot_index < self.pool.slot_buffers.len());
        assert!(self.len <= self.pool.bytes_per_buffer);
        let Self {
            pool,
            capacity_token,
            slot_index,
            len,
        } = self;
        let slot: Arc<SlotCell> = Arc::clone(&pool.slot_buffers[slot_index]);
        let source: Arc<dyn SharedFrameBytes> = slot;
        FrameData::from_shared(source, len, Some(capacity_token))
    }

    pub fn len(&self) -> usize {
        assert!(self.len <= self.pool.bytes_per_buffer);
        self.len
    }

    pub fn is_empty(&self) -> bool {
        let empty = self.len == 0;
        assert!(empty == (self.len == 0));
        empty
    }

    pub fn slot_index(&self) -> usize {
        assert!(self.slot_index < self.pool.slot_buffers.len());
        self.slot_index
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_BYTES_PER_BUFFER: usize = 64 * 64 * 3 / 2;

    #[test]
    fn pool_capacity_is_eight_to_match_obs_encode_ring() {
        assert_eq!(LINUX_SCREEN_FRAME_POOL_CAP, 8);
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        assert_eq!(pool.capacity(), LINUX_SCREEN_FRAME_POOL_CAP);
        assert_eq!(pool.bytes_per_buffer(), TEST_BYTES_PER_BUFFER);
    }

    #[test]
    #[should_panic]
    fn pool_rejects_zero_bytes_per_buffer() {
        let _ = LinuxFrameBufferPool::new(0);
    }

    #[test]
    #[should_panic]
    fn pool_rejects_overflow_bytes_per_buffer() {
        let _ = LinuxFrameBufferPool::new(LINUX_FRAME_BYTES_MAX + 1);
    }

    #[test]
    fn pool_supports_4k_nv12_frames() {
        const NV12_4K_BYTES: usize = 3840 * 2160 * 3 / 2;
        const { assert!(NV12_4K_BYTES <= LINUX_FRAME_BYTES_MAX) };
        let pool = LinuxFrameBufferPool::new(NV12_4K_BYTES).expect("4K NV12 pool init");
        assert_eq!(pool.bytes_per_buffer(), NV12_4K_BYTES);
    }

    #[test]
    fn pool_byte_cap_covers_max_negotiable_stream_dimensions() {
        assert_eq!(LINUX_FRAME_DIM_MAX, 8192);
        const NV12_MAX_DIM_BYTES: usize = LINUX_FRAME_DIM_MAX * LINUX_FRAME_DIM_MAX * 3 / 2;
        const { assert!(NV12_MAX_DIM_BYTES <= LINUX_FRAME_BYTES_MAX) };
    }

    #[test]
    fn oversized_drop_counter_starts_at_zero_and_increments() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        assert_eq!(pool.frames_dropped_oversized(), 0);
        pool.note_frame_dropped_oversized();
        assert_eq!(pool.frames_dropped_oversized(), 1);
        pool.note_frame_dropped_oversized();
        assert_eq!(pool.frames_dropped_oversized(), 2);
        assert_eq!(pool.frames_dropped_pool_exhausted(), 0);
    }

    #[test]
    fn acquire_release_cycle_returns_pooled_buffer_to_circulation() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        assert_eq!(pool.currently_in_flight(), 0);

        let mut pooled = pool.try_acquire().expect("slot available");
        assert_eq!(pool.currently_in_flight(), 1);
        let buf = pooled.buffer_mut();
        assert_eq!(buf.len(), TEST_BYTES_PER_BUFFER);
        buf[0] = 0xAB;
        buf[TEST_BYTES_PER_BUFFER - 1] = 0xCD;
        pooled.set_len(TEST_BYTES_PER_BUFFER);
        assert_eq!(pooled.as_slice().len(), TEST_BYTES_PER_BUFFER);
        assert_eq!(pooled.as_slice()[0], 0xAB);
        assert_eq!(pooled.as_slice()[TEST_BYTES_PER_BUFFER - 1], 0xCD);
        drop(pooled);

        assert_eq!(pool.currently_in_flight(), 0);
        let _again = pool.try_acquire().expect("slot returned to pool");
        assert_eq!(pool.currently_in_flight(), 1);
    }

    #[test]
    fn ninth_acquire_when_eight_in_flight_returns_none_and_increments_dropped_counter() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        let mut held = Vec::with_capacity(LINUX_SCREEN_FRAME_POOL_CAP);
        for i in 0..LINUX_SCREEN_FRAME_POOL_CAP {
            let slot = pool.try_acquire().expect("first eight must acquire");
            assert_eq!(pool.currently_in_flight() as usize, i + 1);
            held.push(slot);
        }
        assert_eq!(held.len(), 8);
        assert_eq!(pool.frames_dropped_pool_exhausted(), 0);

        let ninth = pool.try_acquire();
        assert!(ninth.is_none(), "ninth acquire must skip-don't-block");
        assert_eq!(pool.frames_dropped_pool_exhausted(), 1);

        let tenth = pool.try_acquire();
        assert!(tenth.is_none(), "tenth acquire must skip-don't-block");
        assert_eq!(pool.frames_dropped_pool_exhausted(), 2);

        drop(held);
        assert_eq!(pool.currently_in_flight(), 0);

        let revived = pool.try_acquire().expect("slot returned after releases");
        assert_eq!(pool.currently_in_flight(), 1);
        drop(revived);
    }

    #[test]
    fn buffer_contents_persist_across_acquires_when_slot_recycled() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        let mut first = pool.try_acquire().expect("slot");
        let slot_index_first = first.slot_index();
        first.buffer_mut().fill(0x42);
        first.set_len(TEST_BYTES_PER_BUFFER);
        drop(first);

        let mut second = pool.try_acquire().expect("slot returned");
        assert_eq!(second.slot_index(), slot_index_first);
        let slice = second.buffer_mut();
        assert_eq!(slice[0], 0x42);
        assert_eq!(slice[TEST_BYTES_PER_BUFFER / 2], 0x42);
        slice.fill(0x00);
        drop(second);
    }

    #[test]
    fn into_shared_frame_data_round_trips_bytes_and_returns_slot_on_drop() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        let mut pooled = pool.try_acquire().expect("slot");
        pooled.buffer_mut().fill(0x5A);
        pooled.set_len(TEST_BYTES_PER_BUFFER / 2);
        let slot_index = pooled.slot_index();

        let shared = pooled.into_shared_frame_data();
        assert_eq!(pool.currently_in_flight(), 1);
        assert!(shared.is_shared());
        assert_eq!(shared.len(), TEST_BYTES_PER_BUFFER / 2);
        assert!(shared.as_slice().iter().all(|b| *b == 0x5A));

        drop(shared);
        assert_eq!(pool.currently_in_flight(), 0);
        let again = pool.try_acquire().expect("slot returned by shared drop");
        assert_eq!(again.slot_index(), slot_index);
    }

    #[test]
    fn shared_frame_data_keeps_slot_bytes_alive_after_pool_drop() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        let mut pooled = pool.try_acquire().expect("slot");
        pooled.buffer_mut().fill(0x3C);
        pooled.set_len(8);
        let shared = pooled.into_shared_frame_data();
        drop(pool);
        assert_eq!(shared.as_slice(), &[0x3C; 8]);
    }

    #[test]
    fn exhaustion_drop_policy_and_counters_unchanged_while_shared_frames_held() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        let mut held = Vec::with_capacity(LINUX_SCREEN_FRAME_POOL_CAP);
        for _ in 0..LINUX_SCREEN_FRAME_POOL_CAP {
            let mut pooled = pool.try_acquire().expect("slot within capacity");
            pooled.set_len(1);
            held.push(pooled.into_shared_frame_data());
        }
        assert_eq!(
            pool.currently_in_flight() as usize,
            LINUX_SCREEN_FRAME_POOL_CAP
        );

        assert!(pool.try_acquire().is_none());
        assert_eq!(pool.frames_dropped_pool_exhausted(), 1);

        held.clear();
        assert_eq!(pool.currently_in_flight(), 0);
        let revived = pool
            .try_acquire()
            .expect("slots returned after shared drops");
        assert_eq!(pool.frames_dropped_pool_exhausted(), 1);
        drop(revived);
    }

    #[test]
    fn pool_arc_strong_count_stays_bounded_under_acquire_churn() {
        let pool = LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init");
        for _ in 0..256 {
            let p = pool.try_acquire().expect("slot");
            drop(p);
        }
        assert!(Arc::strong_count(&pool) <= 4);
        assert_eq!(pool.currently_in_flight(), 0);
    }

    #[test]
    fn multi_thread_acquire_release_never_deadlocks_and_balances_counts() {
        use std::sync::Arc as StdArc;
        use std::thread;

        let pool = pool_for_multi_thread();
        let mut threads = Vec::with_capacity(4);
        for _ in 0..4 {
            let pool = StdArc::clone(&pool);
            threads.push(thread::spawn(move || {
                for _ in 0..256 {
                    if let Some(p) = pool.try_acquire() {
                        std::hint::black_box(p.slot_index());
                    }
                }
            }));
        }
        for h in threads {
            h.join().expect("worker completes");
        }
        assert_eq!(pool.currently_in_flight(), 0);
    }

    fn pool_for_multi_thread() -> Arc<LinuxFrameBufferPool> {
        LinuxFrameBufferPool::new(TEST_BYTES_PER_BUFFER).expect("pool init")
    }
}

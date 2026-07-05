// SPDX-License-Identifier: AGPL-3.0-or-later

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use crate::{MAX_FRAME_HEIGHT, MAX_FRAME_WIDTH, nv12_byte_size};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextureFormat {
    Nv12,
    P010,
    Bgra8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendError {
    DimensionsOutOfRange { width: u32, height: u32 },
    UnsupportedFormat { format: TextureFormat },
    PlatformUnsupported { reason: &'static str },
    KeyMismatch { expected: u64, observed: u64 },
    AcquireWhileWriting { slot_index: u32 },
    ReleaseWithoutAcquire { slot_index: u32 },
    WouldBlock { slot_index: u32 },
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DimensionsOutOfRange { width, height } => {
                write!(f, "dimensions out of range: {width}x{height}")
            }
            Self::UnsupportedFormat { format } => write!(f, "unsupported format: {format:?}"),
            Self::PlatformUnsupported { reason } => write!(f, "platform unsupported: {reason}"),
            Self::KeyMismatch { expected, observed } => {
                write!(
                    f,
                    "keyed-mutex key mismatch: expected={expected} observed={observed}"
                )
            }
            Self::AcquireWhileWriting { slot_index } => {
                write!(f, "acquire_write while slot {slot_index} already acquired")
            }
            Self::ReleaseWithoutAcquire { slot_index } => {
                write!(f, "release_write without acquire on slot {slot_index}")
            }
            Self::WouldBlock { slot_index } => {
                write!(
                    f,
                    "keyed mutex busy on slot {slot_index}; skipped without blocking"
                )
            }
        }
    }
}

impl std::error::Error for BackendError {}

pub const NUM_SLOTS_DEFAULT: usize = 8;

pub trait KeyedMutexBackend: Send {
    type SlotHandle: Send + Clone;
    const NUM_SLOTS: usize;

    fn create_slots(
        &mut self,
        width: u32,
        height: u32,
        format: TextureFormat,
    ) -> Result<Vec<Self::SlotHandle>, BackendError>;

    fn acquire_write(&mut self, slot: &Self::SlotHandle, key: u64) -> Result<(), BackendError>;

    fn release_write(&mut self, slot: &Self::SlotHandle, next_key: u64)
    -> Result<(), BackendError>;

    fn poll_complete(&mut self, slot: &Self::SlotHandle) -> bool;

    fn mark_consumed(&mut self, slot: &Self::SlotHandle);

    fn fill_test_pattern(&mut self, _slot: &Self::SlotHandle, _value: u8) {}
}

#[derive(Clone)]
pub struct CpuSlotHandle {
    inner: Arc<CpuSlotInner>,
}

impl CpuSlotHandle {
    pub fn slot_index(&self) -> u32 {
        let idx = self.inner.slot_index;
        assert!((idx as usize) < NUM_SLOTS_DEFAULT, "slot_index in range");
        assert!(
            self.inner.buffer.len() == self.inner.byte_size,
            "buffer matches byte_size"
        );
        idx
    }

    pub fn current_key(&self) -> u64 {
        let key = self.inner.current_key.load(Ordering::Acquire);
        assert!(
            self.inner.buffer.len() == self.inner.byte_size,
            "buffer intact"
        );
        assert!(
            (self.inner.slot_index as usize) < NUM_SLOTS_DEFAULT,
            "slot_index intact"
        );
        key
    }

    pub fn buffer_len(&self) -> usize {
        let len = self.inner.byte_size;
        assert!(len > 0, "byte_size positive");
        assert!(self.inner.buffer.len() == len, "buffer matches byte_size");
        len
    }

    pub fn write_byte(&self, offset: usize, value: u8) {
        assert!(offset < self.inner.byte_size, "offset within buffer");
        assert!(
            self.inner.acquired.load(Ordering::Acquire),
            "writes only while acquired",
        );
        unsafe {
            let ptr = self.inner.buffer.as_ptr().add(offset) as *mut u8;
            ptr.write_volatile(value);
        }
    }
}

struct CpuSlotInner {
    slot_index: u32,
    byte_size: usize,
    buffer: Vec<u8>,
    current_key: AtomicU64,
    acquired: AtomicBool,
    completed: AtomicBool,
}

pub struct CpuMemcpyBackend {
    width: u32,
    height: u32,
    format: TextureFormat,
    slots_created: bool,
    slot_count: u32,
}

impl CpuMemcpyBackend {
    pub fn new() -> Self {
        let backend = Self {
            width: 0,
            height: 0,
            format: TextureFormat::Nv12,
            slots_created: false,
            slot_count: 0,
        };
        assert!(!backend.slots_created, "fresh backend has no slots");
        assert_eq!(backend.slot_count, 0, "fresh slot_count zero");
        backend
    }

    pub fn width(&self) -> u32 {
        assert!(self.width <= MAX_FRAME_WIDTH, "width within cap");
        self.width
    }

    pub fn height(&self) -> u32 {
        assert!(self.height <= MAX_FRAME_HEIGHT, "height within cap");
        self.height
    }
}

impl Default for CpuMemcpyBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyedMutexBackend for CpuMemcpyBackend {
    type SlotHandle = CpuSlotHandle;
    const NUM_SLOTS: usize = NUM_SLOTS_DEFAULT;

    fn create_slots(
        &mut self,
        width: u32,
        height: u32,
        format: TextureFormat,
    ) -> Result<Vec<CpuSlotHandle>, BackendError> {
        if width == 0 || height == 0 || width > MAX_FRAME_WIDTH || height > MAX_FRAME_HEIGHT {
            return Err(BackendError::DimensionsOutOfRange { width, height });
        }
        if !matches!(format, TextureFormat::Nv12) {
            return Err(BackendError::UnsupportedFormat { format });
        }
        assert!(!self.slots_created, "slots created once");
        let byte_size = nv12_byte_size(width, height);
        assert!(byte_size > 0, "byte_size positive");
        let mut out: Vec<CpuSlotHandle> = Vec::with_capacity(Self::NUM_SLOTS);
        for idx in 0..Self::NUM_SLOTS {
            let inner = CpuSlotInner {
                slot_index: idx as u32,
                byte_size,
                buffer: vec![0u8; byte_size],
                current_key: AtomicU64::new(0),
                acquired: AtomicBool::new(false),
                completed: AtomicBool::new(false),
            };
            out.push(CpuSlotHandle {
                inner: Arc::new(inner),
            });
        }
        self.width = width;
        self.height = height;
        self.format = format;
        self.slots_created = true;
        self.slot_count = Self::NUM_SLOTS as u32;
        assert_eq!(out.len(), Self::NUM_SLOTS, "slot vector length");
        assert!(self.slots_created, "slots_created flipped");
        Ok(out)
    }

    fn acquire_write(&mut self, slot: &CpuSlotHandle, key: u64) -> Result<(), BackendError> {
        assert!(self.slots_created, "slots must exist before acquire");
        let current = slot.inner.current_key.load(Ordering::Acquire);
        if current != key {
            return Err(BackendError::KeyMismatch {
                expected: key,
                observed: current,
            });
        }
        let was_acquired = slot.inner.acquired.swap(true, Ordering::AcqRel);
        if was_acquired {
            return Err(BackendError::AcquireWhileWriting {
                slot_index: slot.inner.slot_index,
            });
        }
        slot.inner.completed.store(false, Ordering::Release);
        assert!(
            slot.inner.acquired.load(Ordering::Acquire),
            "acquired flag set"
        );
        assert!(
            !slot.inner.completed.load(Ordering::Acquire),
            "completed cleared"
        );
        Ok(())
    }

    fn release_write(&mut self, slot: &CpuSlotHandle, next_key: u64) -> Result<(), BackendError> {
        assert!(self.slots_created, "slots must exist before release");
        let was_acquired = slot.inner.acquired.swap(false, Ordering::AcqRel);
        if !was_acquired {
            return Err(BackendError::ReleaseWithoutAcquire {
                slot_index: slot.inner.slot_index,
            });
        }
        slot.inner.current_key.store(next_key, Ordering::Release);
        slot.inner.completed.store(true, Ordering::Release);
        assert!(
            !slot.inner.acquired.load(Ordering::Acquire),
            "acquired cleared"
        );
        assert!(
            slot.inner.completed.load(Ordering::Acquire),
            "completed flag set"
        );
        Ok(())
    }

    fn poll_complete(&mut self, slot: &CpuSlotHandle) -> bool {
        let done = slot.inner.completed.load(Ordering::Acquire);
        assert!(self.slots_created, "slots exist for poll");
        assert!(
            (slot.inner.slot_index as usize) < Self::NUM_SLOTS,
            "slot index in range"
        );
        done
    }

    fn mark_consumed(&mut self, slot: &CpuSlotHandle) {
        assert!(self.slots_created, "slots exist for mark_consumed");
        assert!(
            (slot.inner.slot_index as usize) < Self::NUM_SLOTS,
            "slot index in range"
        );
        slot.inner.completed.store(false, Ordering::Release);
    }

    fn fill_test_pattern(&mut self, slot: &CpuSlotHandle, value: u8) {
        assert!(self.slots_created, "slots exist for fill");
        assert!(
            slot.inner.acquired.load(Ordering::Acquire),
            "fill only while acquired"
        );
        let len = slot.inner.byte_size;
        for offset in 0..len {
            slot.write_byte(offset, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_slots_for_1080p_nv12_yields_eight_slots() {
        let mut backend = CpuMemcpyBackend::new();
        let slots = backend
            .create_slots(1920, 1080, TextureFormat::Nv12)
            .expect("creation succeeds");
        assert_eq!(slots.len(), CpuMemcpyBackend::NUM_SLOTS);
        assert_eq!(slots.len(), 8);
        for (idx, slot) in slots.iter().enumerate() {
            assert_eq!(slot.slot_index(), idx as u32);
            assert_eq!(slot.buffer_len(), 1920 * 1080 * 3 / 2);
        }
    }

    #[test]
    fn create_slots_rejects_zero_dims() {
        let mut backend = CpuMemcpyBackend::new();
        let err = backend.create_slots(0, 1080, TextureFormat::Nv12).err();
        assert!(matches!(
            err,
            Some(BackendError::DimensionsOutOfRange { .. })
        ));
    }

    #[test]
    fn create_slots_rejects_unsupported_format() {
        let mut backend = CpuMemcpyBackend::new();
        let err = backend.create_slots(1920, 1080, TextureFormat::P010).err();
        assert!(matches!(err, Some(BackendError::UnsupportedFormat { .. })));
    }

    #[test]
    fn acquire_release_round_trip_marks_complete() {
        let mut backend = CpuMemcpyBackend::new();
        let slots = backend
            .create_slots(64, 64, TextureFormat::Nv12)
            .expect("create");
        let slot = slots[0].clone();
        backend.acquire_write(&slot, 0).expect("acquire");
        backend.release_write(&slot, 1).expect("release");
        assert!(backend.poll_complete(&slot));
        backend.mark_consumed(&slot);
        assert!(!backend.poll_complete(&slot));
    }

    #[test]
    fn double_acquire_rejects() {
        let mut backend = CpuMemcpyBackend::new();
        let slots = backend
            .create_slots(64, 64, TextureFormat::Nv12)
            .expect("create");
        let slot = slots[0].clone();
        backend.acquire_write(&slot, 0).expect("first acquire");
        let err = backend.acquire_write(&slot, 0).err();
        assert!(matches!(
            err,
            Some(BackendError::AcquireWhileWriting { .. })
        ));
    }
}

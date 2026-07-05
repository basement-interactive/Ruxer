// SPDX-License-Identifier: AGPL-3.0-or-later

#![deny(clippy::too_many_lines)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]
#![deny(warnings)]

pub mod backend;
pub mod d3d11;
pub mod encoder_handoff;
pub mod metal_iosurface;
pub mod ring;

#[cfg(target_os = "macos")]
pub mod metal_iosurface_macos;

#[cfg(target_os = "macos")]
pub mod vt_compression_macos;

#[cfg(target_os = "windows")]
pub mod amf;
#[cfg(target_os = "windows")]
pub mod nvenc;
#[cfg(target_os = "windows")]
pub mod qsv;

pub use backend::{CpuMemcpyBackend, CpuSlotHandle, KeyedMutexBackend, TextureFormat};
pub use d3d11::D3D11KeyedMutexBackend;
pub use encoder_handoff::{
    AmfHandoff, EncodedBitstream, EncoderDims, EncoderError, EncoderFrameRate, EncoderSubmission,
    HandoffSlot, NotImplementedHandoff, NvencHandoff, PicParams, QsvHandoff, VideoToolboxHandoff,
    VtNoOpHandoff, apply_dts_offset, compute_dts_offset_us,
};
pub use metal_iosurface::{
    IoSurfaceSlotHandle, METAL_IOSURFACE_SEED_BASE, MetalSharedTextureBackend,
};

pub use ring::{
    DUPLICATE_COUNT_MAX, EncoderInputRing, EncoderReady, FillReservation, RING_SIZE, RingError,
    RingMetrics,
};
#[cfg(target_os = "macos")]
pub use vt_compression_macos::{VtCompressionHandoff, VtPixelTransfer};

#[cfg(target_os = "windows")]
pub use amf::AmfD3D11Handoff;
#[cfg(target_os = "windows")]
pub use nvenc::{COMPLETION_RING_CAPACITY as NVENC_COMPLETION_RING_CAPACITY, NvencD3D11Handoff};
#[cfg(target_os = "windows")]
pub use qsv::QsvD3D11Handoff;

pub const NV12_BPP_NUMERATOR: u32 = 3;
pub const NV12_BPP_DENOMINATOR: u32 = 2;

pub const MAX_FRAME_WIDTH: u32 = 7680;
pub const MAX_FRAME_HEIGHT: u32 = 4320;

#[inline]
pub const fn nv12_byte_size(width: u32, height: u32) -> usize {
    let w = width as usize;
    let h = height as usize;
    (w * h * NV12_BPP_NUMERATOR as usize) / NV12_BPP_DENOMINATOR as usize
}

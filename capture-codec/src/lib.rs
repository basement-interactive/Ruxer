//! Hot screen-capture codec path: BGRA downscale + JPEG encode.
//!
//! Lives in its own crate because both `image::imageops::resize` and
//! `jpeg_encoder::Encoder::encode` are GENERIC — they monomorphize into the
//! CALLING crate, so the workspace's `[profile.dev.package."*"] opt-level = 2`
//! override never applies to them when called from the opt-level-0 app crate.
//! In a debug `cargo tauri dev` run that made 1080p encode ~10x slower
//! (~300 ms/frame), capping the native screenshare pipeline at a handful of
//! fps with over a second of queued latency. This crate gets an explicit
//! `[profile.dev.package.fluxer-capture-codec] opt-level = 3` override in the
//! workspace root, so the monomorphized hot loops are always optimized —
//! including in dev builds.

/// Downscale a tightly-packed 4-byte-per-pixel buffer to `max_width`
/// (aspect preserving). The channel order is irrelevant to the per-channel
/// Triangle (bilinear) resize, so BGRA input stays BGRA in the output.
/// Returns the possibly-resized `(w, h, bgra)`; on an invalid buffer the
/// pixel vec comes back empty.
pub fn downscale_bgra(w: u32, h: u32, bgra: Vec<u8>, max_width: u32) -> (u32, u32, Vec<u8>) {
    if max_width == 0 || w <= max_width {
        return (w, h, bgra);
    }
    // Treat the BGRA bytes as an `RgbaImage` purely as a 4-channel container;
    // the label is cosmetic and the resize is channel-order agnostic.
    let img = match image::RgbaImage::from_raw(w, h, bgra) {
        Some(img) => img,
        None => return (w, h, Vec::new()),
    };
    let target_h = ((h as u64 * max_width as u64) / w as u64).max(1) as u32;
    let out = image::imageops::resize(
        &img,
        max_width,
        target_h,
        image::imageops::FilterType::Triangle,
    );
    (out.width(), out.height(), out.into_raw())
}

/// JPEG-encode a BGRA frame via the SIMD `jpeg-encoder` crate (consumes BGRA
/// directly — no channel swap, no intermediate RGB copy). Returns `None` if
/// the dimensions don't fit `u16` or encoding fails (caller falls back to the
/// raw wire format).
pub fn encode_jpeg_bgra(w: u32, h: u32, bgra: &[u8], quality: u8) -> Option<Vec<u8>> {
    use jpeg_encoder::{ColorType, Encoder};

    let (Ok(w16), Ok(h16)) = (u16::try_from(w), u16::try_from(h)) else {
        return None;
    };
    // Pre-size to a rough JPEG estimate to avoid reallocs; JPEG is far smaller
    // than the raw buffer, so this is generous.
    let mut out: Vec<u8> = Vec::with_capacity(bgra.len() / 8 + 1024);
    let encoder = Encoder::new(&mut out, quality);
    if encoder.encode(bgra, w16, h16, ColorType::Bgra).is_ok() && !out.is_empty() {
        Some(out)
    } else {
        None
    }
}

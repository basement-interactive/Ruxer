// SPDX-License-Identifier: AGPL-3.0-or-later

use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE,
    D3D11_RESOURCE_MISC_SHARED, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING,
    D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_CONTENT_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
    D3D11_VPIV_DIMENSION_TEXTURE2D, D3D11_VPOV_DIMENSION_TEXTURE2D, ID3D11Device,
    ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D, ID3D11VideoContext, ID3D11VideoContext1,
    ID3D11VideoDevice, ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator,
    ID3D11VideoProcessorInputView, ID3D11VideoProcessorOutputView,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
    DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020, DXGI_COLOR_SPACE_TYPE,
    DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709, DXGI_FORMAT_NV12, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::IDXGIResource;
use windows::core::Interface;

use crate::hdr;

fn vlog(msg: &str) {
    if crate::game_capture_abi::env_flag_enabled(crate::game_capture_abi::ENV_VERBOSE) {
        use std::io::Write;
        let _ = writeln!(std::io::stderr(), "[fluxer-nv12] {msg}");
    }
}

pub const NV12_OUTPUT_SLOT_COUNT: usize = 3;

struct Nv12OutputSlot {
    texture: ID3D11Texture2D,
    view: ID3D11VideoProcessorOutputView,
    handle: u64,
}

pub struct Nv12GpuConverter {
    _video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
    processor: ID3D11VideoProcessor,
    _enumerator: ID3D11VideoProcessorEnumerator,
    input_view: ID3D11VideoProcessorInputView,
    output_slots: [Nv12OutputSlot; NV12_OUTPUT_SLOT_COUNT],
    slot_cursor: usize,
    context: ID3D11DeviceContext,
    device: ID3D11Device,
    out_width: u32,
    out_height: u32,
    /// Reusable CPU-readback staging texture (created lazily, reused across
    /// frames, recreated only on a dimension change). Only populated when the
    /// CPU-readback path (`convert_to_cpu_nv12`) is exercised.
    readback: Option<Nv12ReadbackStaging>,
}

pub struct Nv12SharedTextureFrame {
    pub handle: u64,
    pub width: u32,
    pub height: u32,
    pub dxgi_format: u32,
}

/// Tightly-packed CPU NV12 planes read back from the GPU NV12 texture.
///
/// Layout matches `fluxer_screen_frame_bus::Nv12Frame`: a single buffer holding
/// the full-resolution Y plane (`height` rows of `width` bytes, stride =
/// `width`) immediately followed by the interleaved UV plane (`height / 2` rows
/// of `width` bytes, stride = `width`). De-strided from the mapped `RowPitch`,
/// so both plane strides equal `width` and there is no per-row padding.
pub struct CpuNv12 {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub stride_y: u32,
    pub stride_uv: u32,
}

/// Reusable staging texture for GPU -> CPU NV12 readback. Rebuilt only when the
/// output dimensions change; on the steady-state hot path it is copied into and
/// mapped every frame without any reallocation.
struct Nv12ReadbackStaging {
    texture: ID3D11Texture2D,
    resource: ID3D11Resource,
    width: u32,
    height: u32,
}

impl Nv12GpuConverter {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        input: &ID3D11Texture2D,
        in_width: u32,
        in_height: u32,
        out_width: u32,
        out_height: u32,
        source_format: hdr::SourceFormat,
    ) -> Option<Self> {
        let out_width = (out_width & !1).max(2);
        let out_height = (out_height & !1).max(2);
        let video_device = device
            .cast::<ID3D11VideoDevice>()
            .inspect_err(|e| vlog(&format!("cast ID3D11VideoDevice failed: {e:?}")))
            .ok()?;
        let video_context = context
            .cast::<ID3D11VideoContext>()
            .inspect_err(|e| vlog(&format!("cast ID3D11VideoContext failed: {e:?}")))
            .ok()?;

        let content_desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            InputWidth: in_width,
            InputHeight: in_height,
            OutputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            OutputWidth: out_width,
            OutputHeight: out_height,
            Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&content_desc) }
            .inspect_err(|e| vlog(&format!("CreateVideoProcessorEnumerator: {e:?}")))
            .ok()?;
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0) }
            .inspect_err(|e| vlog(&format!("CreateVideoProcessor: {e:?}")))
            .ok()?;

        if let Ok(vctx1) = video_context.cast::<ID3D11VideoContext1>() {
            let input_cs = input_colour_space(source_format);
            unsafe {
                vctx1.VideoProcessorSetStreamColorSpace1(&processor, 0, input_cs);
                vctx1.VideoProcessorSetOutputColorSpace1(
                    &processor,
                    DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
                );
            }
            vlog(&format!(
                "video processor colour space set: input={} -> output=YCbCr studio Rec.709",
                input_cs.0
            ));
        } else {
            vlog("ID3D11VideoContext1 unavailable; using default SDR Rec.709 colour space");
        }

        let output_desc = D3D11_TEXTURE2D_DESC {
            Width: out_width,
            Height: out_height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: D3D11_RESOURCE_MISC_SHARED.0 as u32,
        };
        let mut output_slots = Vec::with_capacity(NV12_OUTPUT_SLOT_COUNT);
        for _ in 0..NV12_OUTPUT_SLOT_COUNT {
            output_slots.push(create_output_slot(
                device,
                &video_device,
                &enumerator,
                &output_desc,
            )?);
        }
        assert_eq!(
            output_slots.len(),
            NV12_OUTPUT_SLOT_COUNT,
            "all NV12 output slots created"
        );
        let Ok(output_slots) = <[Nv12OutputSlot; NV12_OUTPUT_SLOT_COUNT]>::try_from(output_slots)
        else {
            vlog("NV12 output slot count mismatch");
            return None;
        };

        let input_view_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                Texture2D: windows::Win32::Graphics::Direct3D11::D3D11_TEX2D_VPIV {
                    MipSlice: 0,
                    ArraySlice: 0,
                },
            },
        };
        let mut input_view = None;
        unsafe {
            video_device.CreateVideoProcessorInputView(
                input,
                &enumerator,
                &input_view_desc,
                Some(&mut input_view),
            )
        }
        .inspect_err(|e| vlog(&format!("CreateVideoProcessorInputView: {e:?}")))
        .ok()?;
        let input_view = input_view?;
        vlog(&format!(
            "NV12 converter built OK ({in_width}x{in_height} -> {out_width}x{out_height})"
        ));

        Some(Self {
            _video_device: video_device,
            video_context,
            processor,
            _enumerator: enumerator,
            input_view,
            output_slots,
            slot_cursor: 0,
            context: context.clone(),
            device: device.clone(),
            out_width,
            out_height,
            readback: None,
        })
    }

    pub fn dxgi_format(&self) -> u32 {
        DXGI_FORMAT_NV12.0 as u32
    }

    pub fn convert_shared_texture(&mut self) -> Result<Nv12SharedTextureFrame, String> {
        assert!(
            self.slot_cursor < NV12_OUTPUT_SLOT_COUNT,
            "slot cursor in range"
        );
        assert!(self.out_width >= 2, "output width at least 2");
        let slot_index = self.slot_cursor;
        self.slot_cursor = (slot_index + 1) % NV12_OUTPUT_SLOT_COUNT;
        self.run_video_processor(slot_index)?;
        unsafe {
            self.context.Flush();
        }
        Ok(Nv12SharedTextureFrame {
            handle: self.output_slots[slot_index].handle,
            width: self.out_width,
            height: self.out_height,
            dxgi_format: self.dxgi_format(),
        })
    }

    /// Convert the input into GPU NV12, then read it back into tightly-packed
    /// CPU NV12 planes (`CpuNv12`). Used on Windows where the stock livekit SDK
    /// has no GPU-texture `VideoFrame` path, so the sink needs CPU frames.
    ///
    /// The staging texture is created on first use and reused thereafter; it is
    /// only recreated when the output dimensions change. `CopyResource` +
    /// `Map(D3D11_MAP_READ)` are the per-frame hot path — no allocation of GPU
    /// resources happens per frame; only the destination `Vec<u8>` is allocated.
    pub fn convert_to_cpu_nv12(&mut self) -> Result<CpuNv12, String> {
        assert!(
            self.slot_cursor < NV12_OUTPUT_SLOT_COUNT,
            "slot cursor in range"
        );
        assert!(self.out_width >= 2, "output width at least 2");
        assert!(self.out_height >= 2, "output height at least 2");
        let slot_index = self.slot_cursor;
        self.slot_cursor = (slot_index + 1) % NV12_OUTPUT_SLOT_COUNT;
        self.run_video_processor(slot_index)?;
        self.read_back_slot(slot_index)
    }

    fn ensure_readback_staging(&mut self) -> Result<(), String> {
        let width = self.out_width;
        let height = self.out_height;
        if self
            .readback
            .as_ref()
            .is_some_and(|staging| staging.width == width && staging.height == height)
        {
            return Ok(());
        }
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut staging = None;
        unsafe { self.device.CreateTexture2D(&staging_desc, None, Some(&mut staging)) }
            .map_err(|e| format!("CreateTexture2D NV12 readback staging: {e}"))?;
        let texture = staging.ok_or("CreateTexture2D NV12 readback staging returned null")?;
        let resource: ID3D11Resource = texture
            .cast()
            .map_err(|e| format!("ID3D11Resource NV12 readback staging cast: {e}"))?;
        self.readback = Some(Nv12ReadbackStaging {
            texture,
            resource,
            width,
            height,
        });
        Ok(())
    }

    fn read_back_slot(&mut self, slot_index: usize) -> Result<CpuNv12, String> {
        assert!(slot_index < NV12_OUTPUT_SLOT_COUNT, "slot index in range");
        self.ensure_readback_staging()?;
        let staging = self
            .readback
            .as_ref()
            .ok_or("NV12 readback staging texture was not initialized")?;
        let width = self.out_width as usize;
        let height = self.out_height as usize;
        // NV12: full-res Y plane, then half-height interleaved UV plane. Both
        // rows are `width` bytes wide in the tight destination.
        let chroma_height = height / 2;
        let src_resource: ID3D11Resource = self.output_slots[slot_index]
            .texture
            .cast()
            .map_err(|e| format!("ID3D11Resource NV12 output slot cast: {e}"))?;

        let y_len = width
            .checked_mul(height)
            .ok_or("NV12 readback Y plane size overflow")?;
        let uv_len = width
            .checked_mul(chroma_height)
            .ok_or("NV12 readback UV plane size overflow")?;
        let total = y_len
            .checked_add(uv_len)
            .ok_or("NV12 readback total size overflow")?;

        unsafe {
            self.context
                .CopyResource(&staging.resource, &src_resource);
        }
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&staging.texture, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
        }
        .map_err(|e| format!("Map NV12 readback staging: {e}"))?;

        let row_pitch = mapped.RowPitch as usize;
        if mapped.pData.is_null() || row_pitch < width {
            unsafe {
                self.context.Unmap(&staging.texture, 0);
            }
            return Err(format!(
                "NV12 readback mapped subresource invalid (row_pitch={row_pitch}, width={width})"
            ));
        }

        let mut data = vec![0u8; total];
        // For DXGI_FORMAT_NV12 the mapped memory is one contiguous surface: the
        // Y plane occupies `height` rows at `RowPitch`, and the UV plane starts
        // at `height * RowPitch` (chroma rows also use the same `RowPitch`).
        let src = mapped.pData as *const u8;
        for row in 0..height {
            unsafe {
                std::ptr::copy_nonoverlapping(
                    src.add(row * row_pitch),
                    data.as_mut_ptr().add(row * width),
                    width,
                );
            }
        }
        let uv_src_base = height * row_pitch;
        for row in 0..chroma_height {
            unsafe {
                std::ptr::copy_nonoverlapping(
                    src.add(uv_src_base + row * row_pitch),
                    data.as_mut_ptr().add(y_len + row * width),
                    width,
                );
            }
        }
        unsafe {
            self.context.Unmap(&staging.texture, 0);
        }

        Ok(CpuNv12 {
            data,
            width: self.out_width,
            height: self.out_height,
            stride_y: self.out_width,
            stride_uv: self.out_width,
        })
    }

    fn run_video_processor(&self, slot_index: usize) -> Result<(), String> {
        assert!(slot_index < NV12_OUTPUT_SLOT_COUNT, "slot index in range");
        let mut stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: windows::core::BOOL(1),
            OutputIndex: 0,
            InputFrameOrField: 0,
            PastFrames: 0,
            FutureFrames: 0,
            ppPastSurfaces: std::ptr::null_mut(),
            pInputSurface: std::mem::ManuallyDrop::new(Some(self.input_view.clone())),
            ppFutureSurfaces: std::ptr::null_mut(),
            ppPastSurfacesRight: std::ptr::null_mut(),
            pInputSurfaceRight: std::mem::ManuallyDrop::new(None),
            ppFutureSurfacesRight: std::ptr::null_mut(),
        };
        let blt = unsafe {
            self.video_context.VideoProcessorBlt(
                &self.processor,
                &self.output_slots[slot_index].view,
                0,
                std::slice::from_ref(&stream),
            )
        };
        unsafe {
            std::mem::ManuallyDrop::drop(&mut stream.pInputSurface);
        }
        blt.inspect_err(|e| vlog(&format!("VideoProcessorBlt RGB->NV12: {e:?}")))
            .map_err(|e| format!("VideoProcessorBlt RGB->NV12: {e}"))
    }
}

fn create_output_slot(
    device: &ID3D11Device,
    video_device: &ID3D11VideoDevice,
    enumerator: &ID3D11VideoProcessorEnumerator,
    output_desc: &D3D11_TEXTURE2D_DESC,
) -> Option<Nv12OutputSlot> {
    assert!(output_desc.Width >= 2, "output width at least 2");
    assert!(output_desc.Height >= 2, "output height at least 2");
    let mut output_texture = None;
    unsafe { device.CreateTexture2D(output_desc, None, Some(&mut output_texture)) }
        .inspect_err(|e| vlog(&format!("CreateTexture2D NV12 output: {e:?}")))
        .ok()?;
    let output_texture = output_texture?;
    let resource: IDXGIResource = output_texture
        .cast()
        .inspect_err(|e| {
            vlog(&format!(
                "QueryInterface IDXGIResource for NV12 output: {e:?}"
            ))
        })
        .ok()?;
    let shared_handle = unsafe { resource.GetSharedHandle() }
        .inspect_err(|e| vlog(&format!("GetSharedHandle NV12 output: {e:?}")))
        .ok()?;
    if shared_handle.is_invalid() {
        vlog("GetSharedHandle NV12 output returned an invalid handle");
        return None;
    }
    let shared_handle = shared_handle.0 as usize as u64;

    let output_view_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
        ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
        Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
            Texture2D: windows::Win32::Graphics::Direct3D11::D3D11_TEX2D_VPOV { MipSlice: 0 },
        },
    };
    let mut output_view = None;
    unsafe {
        video_device.CreateVideoProcessorOutputView(
            &output_texture,
            enumerator,
            &output_view_desc,
            Some(&mut output_view),
        )
    }
    .inspect_err(|e| vlog(&format!("CreateVideoProcessorOutputView: {e:?}")))
    .ok()?;
    let output_view = output_view?;

    Some(Nv12OutputSlot {
        texture: output_texture,
        view: output_view,
        handle: shared_handle,
    })
}

fn input_colour_space(source_format: hdr::SourceFormat) -> DXGI_COLOR_SPACE_TYPE {
    match source_format {
        hdr::SourceFormat::R10G10B10A2 { hdr: true } => DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020,
        hdr::SourceFormat::Rgba16Float { hdr: true } => DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709,
        _ => DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
    }
}

unsafe impl Send for Nv12GpuConverter {}

#[cfg(test)]
mod tests {
    use super::*;

    fn cs_value(source_format: hdr::SourceFormat) -> i32 {
        input_colour_space(source_format).0
    }

    #[test]
    fn eight_bit_sources_use_sdr_rec709_colour_space() {
        assert_eq!(
            cs_value(hdr::SourceFormat::Bgra8),
            DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709.0
        );
        assert_eq!(
            cs_value(hdr::SourceFormat::Rgba8),
            DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709.0
        );
    }

    #[test]
    fn unflagged_high_precision_sources_stay_sdr_rec709() {
        assert_eq!(
            cs_value(hdr::SourceFormat::R10G10B10A2 { hdr: false }),
            DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709.0
        );
        assert_eq!(
            cs_value(hdr::SourceFormat::Rgba16Float { hdr: false }),
            DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709.0
        );
    }

    #[test]
    fn ten_bit_hdr_uses_pq_rec2020_input_space() {
        assert_eq!(
            cs_value(hdr::SourceFormat::R10G10B10A2 { hdr: true }),
            DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020.0
        );
    }

    #[test]
    fn fp16_hdr_uses_linear_extended_rec709_input_space() {
        assert_eq!(
            cs_value(hdr::SourceFormat::Rgba16Float { hdr: true }),
            DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709.0
        );
    }
}

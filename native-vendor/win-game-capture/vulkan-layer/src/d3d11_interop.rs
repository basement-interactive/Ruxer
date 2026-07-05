// SPDX-License-Identifier: AGPL-3.0-or-later

use ash::vk;
use windows::Win32::Graphics::{
    Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_UNKNOWN, D3D_DRIVER_TYPE_WARP},
    Direct3D11::{
        D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        D3D11_RESOURCE_MISC_SHARED, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    },
    Dxgi::{
        Common::{
            DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
            DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM_SRGB,
            DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_SAMPLE_DESC,
        },
        IDXGIResource,
    },
};
use windows::core::Interface;

use crate::game_capture_abi::{GAME_CAPTURE_FLAG_HDR, GAME_CAPTURE_FLAG_TEN_BIT};

#[derive(Clone, Copy)]
pub struct InteropFormat {
    pub vk_format: vk::Format,
    pub dxgi_format: DXGI_FORMAT,
    pub capture_flags: u32,
}

pub fn interop_format(format: vk::Format) -> Option<InteropFormat> {
    let (dxgi_format, capture_flags) = match format {
        vk::Format::B8G8R8A8_UNORM => (DXGI_FORMAT_B8G8R8A8_UNORM, 0),
        vk::Format::B8G8R8A8_SRGB => (DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, 0),
        vk::Format::R8G8B8A8_UNORM => (DXGI_FORMAT_R8G8B8A8_UNORM, 0),
        vk::Format::R8G8B8A8_SRGB => (DXGI_FORMAT_R8G8B8A8_UNORM_SRGB, 0),
        vk::Format::A2B10G10R10_UNORM_PACK32 => (
            DXGI_FORMAT_R10G10B10A2_UNORM,
            GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR,
        ),
        vk::Format::R16G16B16A16_SFLOAT => (DXGI_FORMAT_R16G16B16A16_FLOAT, GAME_CAPTURE_FLAG_HDR),
        _ => return None,
    };
    Some(InteropFormat {
        vk_format: format,
        dxgi_format,
        capture_flags,
    })
}

pub struct D3d11Device {
    device: ID3D11Device,
    _context: ID3D11DeviceContext,
}

unsafe impl Send for D3d11Device {}
unsafe impl Sync for D3d11Device {}

pub struct SharedTexture {
    _texture: ID3D11Texture2D,
    pub handle: u64,
}

unsafe impl Send for SharedTexture {}
unsafe impl Sync for SharedTexture {}

impl D3d11Device {
    pub fn create() -> Option<Self> {
        for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            let result = unsafe {
                D3D11CreateDevice(
                    None,
                    driver,
                    Default::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )
            };
            if result.is_ok()
                && let (Some(device), Some(context)) = (device, context)
            {
                return Some(Self {
                    device,
                    _context: context,
                });
            }
        }
        let _ = D3D_DRIVER_TYPE_UNKNOWN;
        None
    }

    pub fn create_shared_texture(
        &self,
        width: u32,
        height: u32,
        format: InteropFormat,
    ) -> Option<SharedTexture> {
        if width == 0 || height == 0 {
            return None;
        }
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: format.dxgi_format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: D3D11_RESOURCE_MISC_SHARED.0 as u32,
        };
        let mut texture: Option<ID3D11Texture2D> = None;
        let result = unsafe { self.device.CreateTexture2D(&desc, None, Some(&mut texture)) };
        if result.is_err() {
            return None;
        }
        let texture = texture?;
        let resource: IDXGIResource = texture.cast().ok()?;
        let handle = unsafe { resource.GetSharedHandle() }.ok()?;
        if handle.is_invalid() {
            return None;
        }
        Some(SharedTexture {
            _texture: texture,
            handle: handle.0 as usize as u64,
        })
    }
}

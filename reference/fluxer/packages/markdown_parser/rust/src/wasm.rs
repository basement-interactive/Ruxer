// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::constants::RESULT_HEADER_BYTES;

#[unsafe(no_mangle)]
pub extern "C" fn markdown_alloc(len: u32) -> u32 {
    if len == 0 {
        return 0;
    }

    let Ok(len) = usize::try_from(len) else {
        return 0;
    };
    let mut bytes = Vec::new();
    if bytes.try_reserve_exact(len).is_err() {
        return 0;
    }
    bytes.resize(len, 0);

    leak_u8_boxed_slice(bytes.into_boxed_slice()).unwrap_or(0)
}

#[allow(clippy::missing_safety_doc)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn markdown_free(ptr: u32, len: u32) {
    unsafe { free(ptr, len) };
}

#[allow(clippy::missing_safety_doc)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn parse_markdown_ast(
    input_ptr: u32,
    input_len: u32,
    flags: u32,
    emoji_context_ptr: u32,
    emoji_context_len: u32,
    out_ptr: u32,
) -> u32 {
    let Some(input) = (unsafe { read_utf8(input_ptr, input_len) }) else {
        return unsafe { set_error_result(out_ptr, "invalid markdown input") };
    };
    let Some(emoji_context) = (unsafe { read_utf8(emoji_context_ptr, emoji_context_len) }) else {
        return unsafe { set_error_result(out_ptr, "invalid emoji context") };
    };
    match crate::parse_markdown_json(input, flags, emoji_context) {
        Ok(json) => unsafe { set_bytes_result(out_ptr, json.into_bytes()) },
        Err(_) => unsafe { set_error_result(out_ptr, "markdown parse failed") },
    }
}

unsafe fn free(ptr: u32, len: u32) {
    if ptr == 0 || len == 0 {
        return;
    }

    let Ok(len) = usize::try_from(len) else {
        return;
    };
    let ptr = ptr as usize as *mut u8;
    unsafe {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}

unsafe fn read_utf8<'a>(ptr: u32, len: u32) -> Option<&'a str> {
    if ptr == 0 || len == 0 {
        return Some("");
    }
    let Ok(len) = usize::try_from(len) else {
        return None;
    };
    let ptr = ptr as usize as *const u8;
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(bytes).ok()
}

fn write_u32_le(output: &mut [u8], offset: usize, value: u32) {
    output[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

unsafe fn write_result_header(
    out_ptr: u32,
    data_ptr: u32,
    data_len: u32,
    err_ptr: u32,
    err_len: u32,
) -> u32 {
    if out_ptr == 0 {
        return 1;
    }

    let out_ptr = out_ptr as usize as *mut u8;
    let output = unsafe { std::slice::from_raw_parts_mut(out_ptr, RESULT_HEADER_BYTES) };
    write_u32_le(output, 0, data_ptr);
    write_u32_le(output, 4, data_len);
    write_u32_le(output, 8, err_ptr);
    write_u32_le(output, 12, err_len);
    0
}

unsafe fn set_bytes_result(out_ptr: u32, bytes: Vec<u8>) -> u32 {
    if bytes.len() > u32::MAX as usize {
        return unsafe { set_error_result(out_ptr, "result is too large") };
    }

    let len = bytes.len();
    let ptr = match leak_result_bytes(bytes) {
        Ok(ptr) => ptr,
        Err(()) => return unsafe { set_error_result(out_ptr, "result pointer is too large") },
    };
    unsafe { write_result_header(out_ptr, ptr, len as u32, 0, 0) }
}

unsafe fn set_error_result(out_ptr: u32, message: &str) -> u32 {
    let message = message.as_bytes();
    let mut bytes = Vec::new();
    if bytes.try_reserve_exact(message.len()).is_err() {
        return unsafe { write_result_header(out_ptr, 0, 0, 0, 0) }.max(1);
    }
    bytes.extend_from_slice(message);

    let len = bytes.len();
    let ptr = match leak_result_bytes(bytes) {
        Ok(ptr) => ptr,
        Err(()) => return unsafe { write_result_header(out_ptr, 0, 0, 0, 0) }.max(1),
    };
    let _ = unsafe { write_result_header(out_ptr, 0, 0, ptr, len as u32) };
    1
}

fn leak_result_bytes(bytes: Vec<u8>) -> Result<u32, ()> {
    if bytes.is_empty() {
        return Ok(0);
    }
    leak_u8_boxed_slice(bytes.into_boxed_slice()).ok_or(())
}

fn leak_u8_boxed_slice(bytes: Box<[u8]>) -> Option<u32> {
    let mut bytes = bytes;
    let ptr = u32::try_from(bytes.as_mut_ptr() as usize).ok()?;
    std::mem::forget(bytes);
    Some(ptr)
}

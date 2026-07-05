// SPDX-License-Identifier: AGPL-3.0-or-later

use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use windows_sys::Win32::{
    Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
    System::Registry::{
        HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_DWORD,
        REG_OPTION_NON_VOLATILE, REG_VALUE_TYPE, RegCloseKey, RegCreateKeyExW, RegDeleteValueW,
        RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    },
};

const VULKAN_IMPLICIT_LAYERS_KEY: &str = "Software\\Khronos\\Vulkan\\ImplicitLayers";

const HKCU: HKEY = HKEY_CURRENT_USER;
const HKLM: HKEY = HKEY_LOCAL_MACHINE;

pub struct RegistrationState {
    pub registered: bool,
    pub manifest_exists: bool,
    pub dll_exists: bool,
    pub manifest_path: String,
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn manifest_dll_path(manifest_path: &Path) -> Option<PathBuf> {
    let dir = manifest_path.parent()?;
    if let Ok(contents) = std::fs::read_to_string(manifest_path)
        && let Some(library) = extract_library_path(&contents)
    {
        let candidate = Path::new(&library);
        if candidate.is_absolute() {
            return Some(candidate.to_path_buf());
        }
        return Some(dir.join(candidate));
    }
    None
}

fn extract_library_path(contents: &str) -> Option<String> {
    let key = "\"library_path\"";
    let key_pos = contents.find(key)?;
    let rest = contents[key_pos + key.len()..].trim_start();
    let rest = rest.strip_prefix(':')?.trim_start();
    let rest = rest.strip_prefix('"')?;
    let end = rest.find('"')?;
    let raw = &rest[..end];
    Some(raw.replace("\\\\", "\\"))
}

pub fn register_manifest(manifest_path: &str) -> Result<(), String> {
    if manifest_path.trim().is_empty() {
        return Err("Vulkan layer manifest path is empty".into());
    }
    let manifest = Path::new(manifest_path);
    if !manifest.is_file() {
        return Err(format!(
            "Vulkan layer manifest does not exist: {}",
            manifest.display()
        ));
    }
    if let Some(dll) = manifest_dll_path(manifest)
        && !dll.is_file()
    {
        return Err(format!(
            "Vulkan layer DLL referenced by manifest does not exist: {}",
            dll.display()
        ));
    }

    set_value_under(HKCU, manifest_path)?;
    let _ = set_value_under(HKLM, manifest_path);
    Ok(())
}

fn set_value_under(root: HKEY, manifest_path: &str) -> Result<(), String> {
    let subkey = wide(VULKAN_IMPLICIT_LAYERS_KEY);
    let value_name = wide(manifest_path);
    let enabled: u32 = 0;
    let mut key: HKEY = null_mut();
    let create_status = unsafe {
        RegCreateKeyExW(
            root,
            subkey.as_ptr(),
            0,
            null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            null(),
            &mut key,
            null_mut(),
        )
    };
    if create_status != ERROR_SUCCESS {
        return Err(format!(
            "RegCreateKeyExW Vulkan implicit layers failed: {create_status}"
        ));
    }
    let set_status = unsafe {
        RegSetValueExW(
            key,
            value_name.as_ptr(),
            0,
            REG_DWORD,
            (&enabled as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        )
    };
    unsafe {
        RegCloseKey(key);
    }
    if set_status != ERROR_SUCCESS {
        return Err(format!(
            "RegSetValueExW Vulkan implicit layer manifest failed: {set_status}"
        ));
    }
    Ok(())
}

pub fn unregister_manifest(manifest_path: &str) -> Result<(), String> {
    if manifest_path.trim().is_empty() {
        return Err("Vulkan layer manifest path is empty".into());
    }
    let hkcu = delete_value_under(HKCU, manifest_path);
    let _ = delete_value_under(HKLM, manifest_path);
    hkcu
}

fn delete_value_under(root: HKEY, manifest_path: &str) -> Result<(), String> {
    let subkey = wide(VULKAN_IMPLICIT_LAYERS_KEY);
    let value_name = wide(manifest_path);
    let mut key: HKEY = null_mut();
    let open_status = unsafe { RegOpenKeyExW(root, subkey.as_ptr(), 0, KEY_SET_VALUE, &mut key) };
    if open_status == ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    if open_status != ERROR_SUCCESS {
        return Err(format!(
            "RegOpenKeyExW Vulkan implicit layers failed: {open_status}"
        ));
    }
    let delete_status = unsafe { RegDeleteValueW(key, value_name.as_ptr()) };
    unsafe {
        RegCloseKey(key);
    }
    if delete_status == ERROR_SUCCESS || delete_status == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(format!(
            "RegDeleteValueW Vulkan implicit layer manifest failed: {delete_status}"
        ))
    }
}

pub fn registration_state(manifest_path: &str) -> RegistrationState {
    let manifest = Path::new(manifest_path);
    let manifest_exists = manifest.is_file();
    let dll_exists = manifest_dll_path(manifest)
        .map(|dll| dll.is_file())
        .unwrap_or(false);
    let registered = registry_value_present(manifest_path);
    RegistrationState {
        registered,
        manifest_exists,
        dll_exists,
        manifest_path: manifest_path.to_string(),
    }
}

fn registry_value_present(manifest_path: &str) -> bool {
    if manifest_path.trim().is_empty() {
        return false;
    }
    registry_value_present_under(HKCU, manifest_path)
        || registry_value_present_under(HKLM, manifest_path)
}

fn registry_value_present_under(root: HKEY, manifest_path: &str) -> bool {
    let subkey = wide(VULKAN_IMPLICIT_LAYERS_KEY);
    let value_name = wide(manifest_path);
    let mut key: HKEY = null_mut();
    let open_status = unsafe { RegOpenKeyExW(root, subkey.as_ptr(), 0, KEY_QUERY_VALUE, &mut key) };
    if open_status != ERROR_SUCCESS {
        return false;
    }
    let mut value_type: REG_VALUE_TYPE = 0;
    let query_status = unsafe {
        RegQueryValueExW(
            key,
            value_name.as_ptr(),
            null(),
            &mut value_type,
            null_mut(),
            null_mut(),
        )
    };
    unsafe {
        RegCloseKey(key);
    }
    query_status == ERROR_SUCCESS
}

// SPDX-License-Identifier: AGPL-3.0-or-later

use std::env;
use std::path::PathBuf;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "windows" {
        println!("cargo:rerun-if-changed=build.rs");
        return;
    }
    println!("cargo:rerun-if-env-changed=BINDGEN_NVENC_HEADERS");
    println!("cargo:rerun-if-env-changed=BINDGEN_AMF_HEADERS");
    println!("cargo:rerun-if-env-changed=BINDGEN_QSV_HEADERS");
    println!("cargo:rerun-if-changed=build.rs");
    #[cfg(feature = "bindgen-sdk")]
    {
        if let Some(path) = sdk_path("BINDGEN_NVENC_HEADERS", DEFAULT_NVENC_INCLUDE) {
            generate_nvenc_bindings(path);
        }
        if let Some(path) = sdk_path("BINDGEN_AMF_HEADERS", DEFAULT_AMF_INCLUDE) {
            generate_amf_bindings(path);
        }
        if let Some(path) = sdk_path("BINDGEN_QSV_HEADERS", DEFAULT_QSV_INCLUDE) {
            generate_qsv_bindings(path);
        }
    }
}

#[allow(dead_code)]
const DEFAULT_NVENC_INCLUDE: &str = r"C:\Users\Hampus\sdk\nv-codec-headers\include";
#[allow(dead_code)]
const DEFAULT_AMF_INCLUDE: &str = r"C:\Users\Hampus\sdk\AMF\amf\public\include";
#[allow(dead_code)]
const DEFAULT_QSV_INCLUDE: &str = r"C:\Users\Hampus\sdk\libvpl\api\vpl";

#[allow(dead_code)]
fn sdk_path(env_var: &str, default: &str) -> Option<PathBuf> {
    let value = env::var(env_var).unwrap_or_else(|_| default.to_string());
    let path = PathBuf::from(&value);
    if path.exists() { Some(path) } else { None }
}

#[cfg(feature = "bindgen-sdk")]
fn generate_nvenc_bindings(include_root: PathBuf) {
    let header = include_root.join("ffnvcodec").join("nvEncodeAPI.h");
    if !header.exists() {
        println!("cargo:warning=NVENC header missing at {}", header.display());
        return;
    }
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let bindings = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .clang_arg(format!("-I{}", include_root.display()))
        .allowlist_type("NV_ENC.*")
        .allowlist_function("NvEncodeAPI.*")
        .allowlist_var("NV_ENC.*")
        .layout_tests(false)
        .generate()
        .expect("nvenc bindgen");
    bindings
        .write_to_file(out_dir.join("nvenc_bindings.rs"))
        .expect("write nvenc bindings");
}

#[cfg(feature = "bindgen-sdk")]
fn generate_amf_bindings(include_root: PathBuf) {
    let header = include_root.join("components").join("VideoEncoderVCE.h");
    if !header.exists() {
        println!("cargo:warning=AMF header missing at {}", header.display());
        return;
    }
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let bindings = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .clang_arg(format!("-I{}", include_root.display()))
        .allowlist_type("AMF.*")
        .layout_tests(false)
        .generate()
        .expect("amf bindgen");
    bindings
        .write_to_file(out_dir.join("amf_bindings.rs"))
        .expect("write amf bindings");
}

#[cfg(feature = "bindgen-sdk")]
fn generate_qsv_bindings(include_root: PathBuf) {
    let header = include_root.join("mfxvideo.h");
    if !header.exists() {
        println!("cargo:warning=QSV header missing at {}", header.display());
        return;
    }
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let bindings = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .clang_arg(format!("-I{}", include_root.display()))
        .allowlist_type("mfx.*")
        .allowlist_function("MFX.*")
        .layout_tests(false)
        .generate()
        .expect("qsv bindgen");
    bindings
        .write_to_file(out_dir.join("qsv_bindings.rs"))
        .expect("write qsv bindings");
}

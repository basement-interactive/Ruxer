// Copyright 2025 LiveKit, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use std::path::Path;
use std::path::PathBuf;
use std::{env, path, process::Command};

fn main() {
    if env::var("DOCS_RS").is_ok() {
        return;
    }

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    let is_desktop = target_os == "linux" || target_os == "windows" || target_os == "macos";

    println!("cargo:rerun-if-env-changed=LK_DEBUG_WEBRTC");
    println!("cargo:rerun-if-env-changed=LK_CUSTOM_WEBRTC");
    // FLUXER: rebuild if the CUDA toolkit location changes (Windows NVENC arm
    // resolves cuda.h from these; toggling them flips HW codecs on/off).
    println!("cargo:rerun-if-env-changed=CUDA_HOME");
    println!("cargo:rerun-if-env-changed=CUDA_PATH");

    let mut rust_files = vec![
        "src/peer_connection.rs",
        "src/peer_connection_factory.rs",
        "src/audio_device_controller.rs",
        "src/media_stream.rs",
        "src/media_stream_track.rs",
        "src/audio_track.rs",
        "src/video_track.rs",
        "src/data_channel.rs",
        "src/frame_cryptor.rs",
        "src/jsep.rs",
        "src/candidate.rs",
        "src/rtp_parameters.rs",
        "src/rtp_sender.rs",
        "src/rtp_receiver.rs",
        "src/rtp_transceiver.rs",
        "src/rtc_error.rs",
        "src/webrtc.rs",
        "src/video_frame.rs",
        "src/video_frame_buffer.rs",
        "src/helper.rs",
        "src/yuv_helper.rs",
        "src/audio_resampler.rs",
        "src/android.rs",
        "src/prohibit_libsrtp_initialization.rs",
        "src/apm.rs",
        "src/audio_mixer.rs",
        "src/packet_trailer.rs",
    ];

    if is_desktop {
        rust_files.push("src/desktop_capturer.rs");
    }

    let mut builder = cxx_build::bridges(rust_files);

    builder.files(&[
        "src/peer_connection.cpp",
        "src/peer_connection_factory.cpp",
        "src/audio_device_controller.cpp",
        "src/media_stream.cpp",
        "src/media_stream_track.cpp",
        "src/audio_track.cpp",
        "src/video_track.cpp",
        "src/data_channel.cpp",
        "src/jsep.cpp",
        "src/candidate.cpp",
        "src/rtp_receiver.cpp",
        "src/rtp_sender.cpp",
        "src/rtp_transceiver.cpp",
        "src/rtp_parameters.cpp",
        "src/rtc_error.cpp",
        "src/webrtc.cpp",
        "src/video_frame.cpp",
        "src/video_frame_buffer.cpp",
        "src/dmabuf_video_frame_buffer.cpp",
        "src/video_encoder_factory.cpp",
        "src/video_decoder_factory.cpp",
        "src/synthetic_audio_device.cpp",
        "src/adm_proxy.cpp",
        "src/audio_resampler.cpp",
        "src/frame_cryptor.cpp",
        "src/global_task_queue.cpp",
        "src/prohibit_libsrtp_initialization.cpp",
        "src/apm.cpp",
        "src/audio_mixer.cpp",
        "src/packet_trailer.cpp",
        "src/packet_trailer_av1.cpp",
    ]);

    if is_desktop {
        builder.file("src/desktop_capturer.cpp");
    }

    let webrtc_dir = webrtc_sys_build::webrtc_dir();
    let webrtc_include = webrtc_dir.join("include");
    let webrtc_lib = webrtc_dir.join("lib");

    if !webrtc_dir.exists() {
        webrtc_sys_build::download_webrtc().unwrap();
    }

    builder.includes(&[
        path::PathBuf::from("./include"),
        webrtc_include.clone(),
        webrtc_include.join("third_party/abseil-cpp/"),
        webrtc_include.join("third_party/libyuv/include/"),
        webrtc_include.join("third_party/libc++/"),
        // For mac & ios
        webrtc_include.join("sdk/objc"),
        webrtc_include.join("sdk/objc/base"),
    ]);
    builder.define("WEBRTC_APM_DEBUG_DUMP", "0");

    println!("cargo:rustc-link-search=native={}", webrtc_lib.to_str().unwrap());

    for (key, value) in webrtc_sys_build::webrtc_defines() {
        let value = value.as_deref();
        builder.define(key.as_str(), value);
    }

    // Link webrtc library
    println!("cargo:rustc-link-lib=static=webrtc");
    match target_os.as_str() {
        "windows" => {
            println!("cargo:rustc-link-lib=dylib=msdmo");
            println!("cargo:rustc-link-lib=dylib=wmcodecdspuuid");
            println!("cargo:rustc-link-lib=dylib=dmoguids");
            println!("cargo:rustc-link-lib=dylib=crypt32");
            println!("cargo:rustc-link-lib=dylib=iphlpapi");
            println!("cargo:rustc-link-lib=dylib=ole32");
            println!("cargo:rustc-link-lib=dylib=secur32");
            println!("cargo:rustc-link-lib=dylib=winmm");
            println!("cargo:rustc-link-lib=dylib=ws2_32");
            println!("cargo:rustc-link-lib=dylib=strmiids");
            println!("cargo:rustc-link-lib=dylib=d3d11");
            println!("cargo:rustc-link-lib=dylib=gdi32");
            println!("cargo:rustc-link-lib=dylib=dxgi");
            println!("cargo:rustc-link-lib=dylib=dwmapi");
            println!("cargo:rustc-link-lib=dylib=shcore");

            //let path = env::current_dir().unwrap();
            //println!("cargo:rustc-link-search=native={}/vaapi-windows/x64/lib", path.display());
            //println!("cargo:rustc-link-lib=dylib=va");
            //println!("cargo:rustc-link-lib=dylib=va_win32");

            builder
                //.include("./vaapi-windows/DirectX-Headers-1.0/include")
                //.include(path::PathBuf::from("./vaapi-windows/x64/include"))
                //.file("vaapi-windows/DirectX-Headers-1.0/src/dxguids.cpp")
                //.file("src/vaapi/vaapi_display_win32.cpp")
                //.file("src/vaapi/vaapi_h264_encoder_wrapper.cpp")
                //.file("src/vaapi/vaapi_encoder_factory.cpp")
                //.file("src/vaapi/h264_encoder_impl.cpp")
                .flag("/std:c++20")
                //.flag("/wd4819")
                //.flag("/wd4068")
                .flag("/EHsc");

            // --- NVIDIA NVENC/NVDEC (Windows) --------------------------------
            // FLUXER ADDITION. Upstream only wired the NVIDIA HW codec .cpp into
            // the Linux/Jetson arms; the exact same sources are portable to
            // MSVC (cuda_context.cpp / NvEncoder.cpp branch on _WIN32 already;
            // the two factory files got a LoadLibrary shim). NVENC/NVDEC entry
            // points are dynamically loaded from nvcuda.dll + nvEncodeAPI64.dll
            // + nvcuvid.dll, which ship with the NVIDIA driver — so no CUDA
            // libraries are linked, only the driver-API header <cuda.h> is
            // needed at COMPILE time. Resolve it from CUDA_HOME / CUDA_PATH
            // (set by the CUDA Toolkit installer). Absent → skip HW codecs and
            // fall back to the software encoder (still fully functional).
            //
            // CRITICAL: the nvidia TUs are compiled in a SEPARATE cc::Build, NOT
            // added to the shared `builder`. They need a winsock-ordering
            // prelude force-included (cuda.h → windows.h leaks WinSock 1.1 which
            // collides with webrtc's winsock2). cc-rs flags are per-Build, not
            // per-file, so putting `/FI...` on the shared builder poisoned every
            // OTHER webrtc TU (they broke on the forced windows.h). Isolating
            // nvidia into its own Build keeps the prelude scoped to exactly the
            // files that need it. The nvidia sources only include webrtc + cuda
            // + nvidia headers (no cxxbridge-generated headers), so a standalone
            // Build with the same include/define set compiles them fine.
            let cuda_home = env::var("CUDA_HOME")
                .or_else(|_| env::var("CUDA_PATH"))
                .map(PathBuf::from);
            match cuda_home {
                Ok(cuda_home) if cuda_home.join("include").join("cuda.h").exists() => {
                    let cuda_include = cuda_home.join("include");
                    println!(
                        "cargo:warning=NVENC: building NVIDIA hardware codecs against CUDA headers at {}",
                        cuda_include.display()
                    );

                    // cl.exe's cwd for a standalone cc::Build is not guaranteed
                    // to be the crate root, so make EVERY path absolute off
                    // CARGO_MANIFEST_DIR (relative -I / -FI / file paths were
                    // resolving against the wrong dir → cuda.h "not found").
                    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
                    let prelude = manifest_dir.join("src/nvidia/flx_win_prelude.h");
                    let src = |rel: &str| manifest_dir.join(rel);

                    println!("cargo:warning=NVENC: cuda_include={}", cuda_include.display());
                    println!("cargo:warning=NVENC: prelude={}", prelude.display());

                    let mut nv = cc::Build::new();
                    nv.cpp(true)
                        // Same include set the shared webrtc builder uses, so the
                        // nvidia impls see identical rtc_base/api/modules headers.
                        // All ABSOLUTE (see note above).
                        .include(manifest_dir.join("include"))
                        .include(&webrtc_include)
                        .include(webrtc_include.join("third_party/abseil-cpp/"))
                        .include(webrtc_include.join("third_party/libyuv/include/"))
                        .include(webrtc_include.join("third_party/libc++/"))
                        .include(&cuda_include)
                        .include(manifest_dir.join("src/nvidia/NvCodec/include"))
                        .include(manifest_dir.join("src/nvidia/NvCodec/NvCodec"))
                        // Winsock-ordering prelude, scoped to THIS build only.
                        .flag(format!("/FI{}", prelude.display()))
                        .flag("/std:c++20")
                        .flag("/EHsc")
                        .flag("/DUSE_NVIDIA_VIDEO_CODEC=1")
                        // ENCODER ONLY on Windows: the NVDEC decoder needs
                        // nvcuvid.lib (Video Codec SDK, not the base toolkit).
                        // NVENC encode is all we need for screenshare/camera and
                        // loads nvEncodeAPI64.dll dynamically (no import lib).
                        .flag("/DFLX_NVDEC_DISABLED=1")
                        // Suppress NVIDIA sample-header noise: deprecated decls,
                        // codepage 4819, unreferenced params.
                        .flag("/wd4996")
                        .flag("/wd4819")
                        .flag("/wd4100")
                        // NVENC encoder path only (NvDecoder.cpp + the h264/h265
                        // decoder impls + nvidia_decoder_factory.cpp are the
                        // cuvid* callers → excluded).
                        .file(src("src/nvidia/NvCodec/NvCodec/NvEncoder/NvEncoder.cpp"))
                        .file(src("src/nvidia/NvCodec/NvCodec/NvEncoder/NvEncoderCuda.cpp"))
                        .file(src("src/nvidia/h264_encoder_impl.cpp"))
                        .file(src("src/nvidia/h265_encoder_impl.cpp"))
                        .file(src("src/nvidia/nvidia_encoder_factory.cpp"))
                        .file(src("src/nvidia/cuda_context.cpp"));
                    // Match the crt-static (/MT) the rest of the graph uses, plus
                    // the webrtc defines so macro-gated code (WEBRTC_WIN, H265,
                    // etc.) agrees with the prebuilt libwebrtc.
                    nv.static_crt(true);
                    nv.define("WEBRTC_APM_DEBUG_DUMP", "0");
                    for (key, value) in webrtc_sys_build::webrtc_defines() {
                        nv.define(key.as_str(), value.as_deref());
                    }
                    nv.compile("flx_nvidia_codecs");

                    // Tell the shared webrtc build its video_encoder_factory /
                    // video_decoder_factory should register the NVIDIA backends.
                    // Those two TUs #include nvidia/nvidia_*_factory.h under this
                    // define, which transitively pulls cuda_context.h → <cuda.h>
                    // and the flx_win_prelude.h — so the shared builder ALSO
                    // needs the CUDA + nvidia header dirs on its include path.
                    // (Winsock ordering is handled inside the nvidia headers
                    // themselves now, so no /FI is needed on the shared builder,
                    // which is what previously poisoned the other webrtc TUs.)
                    builder
                        .include(&cuda_include)
                        .include(manifest_dir.join("src/nvidia/NvCodec/include"))
                        .flag("/DUSE_NVIDIA_VIDEO_CODEC=1")
                        // Encoder-only (see nv build): keep video_decoder_factory
                        // from registering / referencing the NVDEC decoder, whose
                        // symbols we no longer compile.
                        .flag("/DFLX_NVDEC_DISABLED=1")
                        .flag("/wd4996")
                        .flag("/wd4819");

                    // The nvidia ENCODER impls call the CUDA Driver API (cuInit,
                    // cuCtxCreate_v2, cuMemcpy2D_v2, …) DIRECTLY — not via dlopen
                    // — so those symbols must resolve at link time. On Windows
                    // the import stub is cuda.lib (resolves them to nvcuda.dll at
                    // runtime), which ships with the base CUDA Toolkit. NVENC
                    // itself is loaded dynamically (nvEncodeAPI64.dll), so no
                    // encode import lib is needed. (The Linux arm handles cuda
                    // via add_lazy_load_so("nvidia", ...).) NVDEC is disabled on
                    // Windows precisely because nvcuvid.lib is NOT in the base
                    // toolkit — only the standalone Video Codec SDK.
                    let cuda_lib = cuda_home.join("lib").join("x64");
                    println!("cargo:rustc-link-search=native={}", cuda_lib.display());
                    println!("cargo:rustc-link-lib=dylib=cuda");
                }
                Ok(cuda_home) => {
                    println!(
                        "cargo:warning=NVENC: cuda.h not found under {} (CUDA_HOME/CUDA_PATH set but incomplete); building WITHOUT NVIDIA hardware video codecs",
                        cuda_home.display()
                    );
                }
                Err(_) => {
                    println!(
                        "cargo:warning=NVENC: CUDA_HOME/CUDA_PATH not set; building WITHOUT NVIDIA hardware video codecs (install the CUDA Toolkit to enable Windows NVENC)"
                    );
                }
            }
        }
        "linux" => {
            println!("cargo:rustc-link-lib=dylib=rt");
            println!("cargo:rustc-link-lib=dylib=dl");
            println!("cargo:rustc-link-lib=dylib=pthread");
            println!("cargo:rustc-link-lib=dylib=m");

            // In order to avoid any ABI mismatches we use the sysroot's headers.
            add_gio_headers(&mut builder);

            // Do not use pkg_config::probe_library, because we only require headers.
            for lib_name in ["glib-2.0", "gobject-2.0", "gio-2.0"] {
                let lib = pkg_config::Config::new().cargo_metadata(false).probe(lib_name).unwrap();
                for path in lib.include_paths {
                    builder.include(path);
                }
            }

            add_lazy_load_so(
                &mut builder,
                "desktop_capturer",
                ["drm", "gbm", "X11", "Xfixes", "Xdamage", "Xrandr", "Xcomposite", "Xext"]
                    .map(String::from)
                    .to_vec(),
            );

            let x86 = target_arch == "x86_64" || target_arch == "i686";
            let arm = target_arch == "aarch64" || target_arch.contains("arm");

            if x86 {
                if let Some(libva_include) = pkg_config::get_variable("libva", "includedir").ok() {
                    // Do not use pkg_config::probe_library because libva is dlopened
                    // and pkg_config::probe_library would link it.
                    builder
                        .include(libva_include)
                        .file("src/vaapi/vaapi_display_drm.cpp")
                        .file("src/vaapi/vaapi_h264_encoder_wrapper.cpp")
                        .file("src/vaapi/vaapi_encoder_factory.cpp")
                        .file("src/vaapi/h264_encoder_impl.cpp")
                        .flag("-DUSE_VAAPI_VIDEO_CODEC=1");

                    add_lazy_load_so(
                        &mut builder,
                        "vaapi",
                        ["va", "va-drm"].map(String::from).to_vec(),
                    );
                } else {
                    println!("cargo:warning=libva not found; building without hardware accelerated video codecs");
                }
            }

            if arm {
                let jetson_mmapi_include = PathBuf::from("/usr/src/jetson_multimedia_api/include");
                if jetson_mmapi_include.exists() {
                    let jetson_classes_dir =
                        PathBuf::from("/usr/src/jetson_multimedia_api/samples/common/classes");

                    builder
                        .include(&jetson_mmapi_include)
                        .include("src/jetson")
                        .file("src/jetson/jetson_mmapi_encoder.cpp")
                        .file("src/jetson/jetson_plane_layout.cpp")
                        .file("src/jetson/h264_encoder_impl.cpp")
                        .file("src/jetson/h265_encoder_impl.cpp")
                        .file("src/jetson/av1_encoder_impl.cpp")
                        .file("src/jetson/jetson_av1_bitstream.cpp")
                        .file("src/jetson/jetson_encoder_factory.cpp")
                        .flag("-DUSE_JETSON_VIDEO_CODEC=1");

                    let mmapi_sources = [
                        "NvElement.cpp",
                        "NvV4l2Element.cpp",
                        "NvV4l2ElementPlane.cpp",
                        "NvVideoEncoder.cpp",
                        "NvBuffer.cpp",
                        "NvLogging.cpp",
                        "NvElementProfiler.cpp",
                    ];
                    for src in &mmapi_sources {
                        let src_path = jetson_classes_dir.join(src);
                        if src_path.exists() {
                            builder.file(&src_path);
                        } else {
                            println!(
                                "cargo:warning=Jetson MMAPI source not found: {}",
                                src_path.display()
                            );
                        }
                    }

                    let tegra_lib_dir = PathBuf::from("/usr/lib/aarch64-linux-gnu/tegra");
                    if tegra_lib_dir.exists() {
                        println!("cargo:rustc-link-search=native={}", tegra_lib_dir.display());
                    }
                    println!("cargo:rustc-link-lib=dylib=nvv4l2");
                    println!("cargo:rustc-link-lib=dylib=nvbufsurface");
                    if tegra_lib_dir.join("libnvbuf_utils.so").exists() {
                        println!("cargo:rustc-link-lib=dylib=nvbuf_utils");
                    }
                    println!("cargo:rustc-link-lib=dylib=v4l2");
                }
            }

            if x86 || arm {
                let cuda_home = PathBuf::from(match env::var("CUDA_HOME") {
                    Ok(p) => p,
                    Err(_) => "/usr/local/cuda".to_owned(),
                });
                let cuda_include_dir = cuda_home.join("include");

                // libcuda and libnvcuvid are dlopened, so do not link them.
                if cuda_include_dir.join("cuda.h").exists() {
                    builder
                        .include(cuda_include_dir)
                        .flag("-Isrc/nvidia/NvCodec/include")
                        .flag("-Isrc/nvidia/NvCodec/NvCodec")
                        .file("src/nvidia/NvCodec/NvCodec/NvDecoder/NvDecoder.cpp")
                        .file("src/nvidia/NvCodec/NvCodec/NvEncoder/NvEncoder.cpp")
                        .file("src/nvidia/NvCodec/NvCodec/NvEncoder/NvEncoderCuda.cpp")
                        .file("src/nvidia/h264_encoder_impl.cpp")
                        .file("src/nvidia/h265_encoder_impl.cpp")
                        .file("src/nvidia/h264_decoder_impl.cpp")
                        .file("src/nvidia/h265_decoder_impl.cpp")
                        .file("src/nvidia/nvidia_decoder_factory.cpp")
                        .file("src/nvidia/nvidia_encoder_factory.cpp")
                        .file("src/nvidia/cuda_context.cpp")
                        .flag("-Wno-deprecated-declarations")
                        .flag("-DUSE_NVIDIA_VIDEO_CODEC=1");

                    add_lazy_load_so(
                        &mut builder,
                        "nvidia",
                        ["cuda", "nvcuvid"].map(String::from).to_vec(),
                    );
                } else {
                    println!("cargo:warning=cuda.h not found; building without hardware accelerated video codec support for NVidia GPUs");
                }
            }

            builder
                .flag("-Wno-changes-meaning")
                .flag("-Wno-deprecated-declarations")
                .flag("-std=c++20");
        }
        "macos" => {
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=AVFoundation");
            println!("cargo:rustc-link-lib=framework=CoreAudio");
            println!("cargo:rustc-link-lib=framework=AudioToolbox");
            println!("cargo:rustc-link-lib=framework=Appkit");
            println!("cargo:rustc-link-lib=framework=CoreMedia");
            println!("cargo:rustc-link-lib=framework=CoreGraphics");
            println!("cargo:rustc-link-lib=framework=VideoToolbox");
            println!("cargo:rustc-link-lib=framework=CoreVideo");
            println!("cargo:rustc-link-lib=framework=OpenGL");
            println!("cargo:rustc-link-lib=framework=Metal");
            println!("cargo:rustc-link-lib=framework=MetalKit");
            println!("cargo:rustc-link-lib=framework=QuartzCore");
            println!("cargo:rustc-link-lib=framework=IOKit");
            println!("cargo:rustc-link-lib=framework=IOSurface");
            println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");

            configure_darwin_sysroot(&mut builder);

            builder
                .file("src/objc_video_factory.mm")
                .file("src/objc_video_frame_buffer.mm")
                .flag("-stdlib=libc++")
                .flag("-std=c++20")
                .flag("-Wno-nullability-completeness");
        }
        "ios" => {
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=CoreFoundation");
            println!("cargo:rustc-link-lib=framework=AVFoundation");
            println!("cargo:rustc-link-lib=framework=CoreAudio");
            println!("cargo:rustc-link-lib=framework=UIKit");
            println!("cargo:rustc-link-lib=framework=CoreVideo");
            println!("cargo:rustc-link-lib=framework=CoreGraphics");
            println!("cargo:rustc-link-lib=framework=CoreMedia");
            println!("cargo:rustc-link-lib=framework=VideoToolbox");
            println!("cargo:rustc-link-lib=framework=AudioToolbox");
            println!("cargo:rustc-link-lib=framework=OpenGLES");
            println!("cargo:rustc-link-lib=framework=GLKit");
            println!("cargo:rustc-link-lib=framework=Metal");
            println!("cargo:rustc-link-lib=framework=MetalKit");
            println!("cargo:rustc-link-lib=framework=Network");
            println!("cargo:rustc-link-lib=framework=QuartzCore");

            configure_darwin_sysroot(&mut builder);

            builder
                .file("src/objc_video_factory.mm")
                .file("src/objc_video_frame_buffer.mm")
                .flag("-std=c++20");
        }
        "android" => {
            webrtc_sys_build::configure_jni_symbols().unwrap();

            println!("cargo:rustc-link-lib=EGL");
            println!("cargo:rustc-link-lib=OpenSLES");
            println!("cargo:rustc-link-lib=c++_static");
            println!("cargo:rustc-link-lib=c++abi");

            configure_android_sysroot(&mut builder);
            builder.file("src/android.cpp").flag("-std=c++20");
        }
        _ => {
            panic!("Unsupported target, {}", target_os);
        }
    }

    // TODO(theomonnom) Only add this define when building tests
    builder.define("LIVEKIT_TEST", None);
    builder.warnings(false).compile("webrtcsys-cxx");

    for entry in glob::glob("./src/**/*.cpp").unwrap() {
        println!("cargo:rerun-if-changed={}", entry.unwrap().display());
    }

    for entry in glob::glob("./src/**/*.mm").unwrap() {
        println!("cargo:rerun-if-changed={}", entry.unwrap().display());
    }

    for entry in glob::glob("./include/**/*.h").unwrap() {
        println!("cargo:rerun-if-changed={}", entry.unwrap().display());
    }

    if target_os.as_str() == "android" {
        copy_libwebrtc_jar(&PathBuf::from(Path::new(&webrtc_dir)));
    }
}

fn copy_libwebrtc_jar(webrtc_dir: &PathBuf) {
    let jar_path = webrtc_dir.join("libwebrtc.jar");
    let output_path = get_output_path();
    let output_jar_path = output_path.join("libwebrtc.jar");
    let res = std::fs::copy(jar_path, output_jar_path);
    if let Err(e) = res {
        println!("Failed to copy libwebrtc.jar: {}", e);
    }
}

fn get_output_path() -> PathBuf {
    let manifest_dir_string = env::var("CARGO_MANIFEST_DIR").unwrap();
    let build_type = env::var("PROFILE").unwrap();
    let build_target = env::var("TARGET").unwrap();
    let path =
        Path::new(&manifest_dir_string).join("../target").join(build_target).join(build_type);
    return PathBuf::from(path);
}

fn configure_darwin_sysroot(builder: &mut cc::Build) {
    let target_os = webrtc_sys_build::target_os();

    let sdk = match target_os.as_str() {
        "mac" => "macosx",
        "ios-device" => "iphoneos",
        "ios-simulator" => "iphonesimulator",
        _ => panic!("Unsupported target_os: {}", target_os),
    };

    let clang_rt = match target_os.as_str() {
        "mac" => "clang_rt.osx",
        "ios-device" => "clang_rt.ios",
        "ios-simulator" => "clang_rt.iossim",
        _ => panic!("Unsupported target_os: {}", target_os),
    };

    println!("cargo:rustc-link-lib={}", clang_rt);
    println!("cargo:rustc-link-arg=-ObjC");

    let sysroot = Command::new("xcrun").args(["--sdk", sdk, "--show-sdk-path"]).output().unwrap();

    let sysroot = String::from_utf8_lossy(&sysroot.stdout);
    let sysroot = sysroot.trim();

    let search_dirs = Command::new("cc").arg("--print-search-dirs").output().unwrap();

    let search_dirs = String::from_utf8_lossy(&search_dirs.stdout);
    for line in search_dirs.lines() {
        if line.contains("libraries: =") {
            let path = line.split('=').nth(1).unwrap();
            let path = format!("{}/lib/darwin", path);
            println!("cargo:rustc-link-search={}", path);
        }
    }

    builder.flag(format!("-isysroot{}", sysroot).as_str());
}

fn configure_android_sysroot(builder: &mut cc::Build) {
    let toolchain = webrtc_sys_build::android_ndk_toolchain().unwrap();
    let sysroot = toolchain.join("sysroot").canonicalize().unwrap();
    builder.flag(format!("-isysroot{}", sysroot.display()).as_str());
}

fn add_lazy_load_so(builder: &mut cc::Build, name: &str, libraries: Vec<String>) {
    let target_arch = webrtc_sys_build::target_arch();
    for lib_name in libraries {
        let mut arch_dir = "x86_64-linux-gnu";
        if target_arch.contains("arm64") {
            arch_dir = "aarch64-linux-gnu";
        }
        let implib_file_c_name = "src/lazy_load_deps_for/".to_owned()
            + name
            + "/"
            + arch_dir
            + "/lib"
            + &lib_name
            + ".so.init.c";
        let implib_file_asm_name = "src/lazy_load_deps_for/".to_owned()
            + name
            + "/"
            + arch_dir
            + "/lib"
            + &lib_name
            + ".so.tramp.S";
        builder.file(implib_file_c_name).file(implib_file_asm_name);
    }
}

fn add_gio_headers(builder: &mut cc::Build) {
    let webrtc_dir = webrtc_sys_build::webrtc_dir();
    let target_arch = webrtc_sys_build::target_arch();
    let target_arch_sysroot = match target_arch.as_str() {
        "arm64" => "arm64",
        "x64" => "amd64",
        _ => panic!("unsupported arch"),
    };
    let sysroot_path = format!("include/build/linux/debian_bullseye_{target_arch_sysroot}-sysroot");
    let sysroot = webrtc_dir.join(sysroot_path);
    let glib_path = sysroot.join("usr/include/glib-2.0");
    println!("cargo:info=add_gio_headers {}", glib_path.display());

    builder.include(&glib_path);
    let arch_specific_path = match target_arch.as_str() {
        "x64" => "x86_64-linux-gnu",
        "arm64" => "aarch64-linux-gnu",
        _ => panic!("unsupported target"),
    };

    let glib_path_config = sysroot.join("usr/lib");
    let glib_path_config = glib_path_config.join(arch_specific_path);
    let glib_path_config = glib_path_config.join("glib-2.0/include");
    builder.include(&glib_path_config);
}

---
name: fluxer-build-speed
description: Rust compile/link time optimizations for the Tauri Fluxer client (lld-link, sccache, dev profile)
metadata:
  type: project
---

Goal (set 2026-07-01): minimize Rust compile+link time without breaking features. The heavy graph is tauri + livekit(JS, not Rust) + windows crate + reqwest + tokio + typify build.rs. Frontend is Vite (esbuild) — already fast; the slowness is Rust. Relates to [[fluxer-screenshare-perf]].

**Applied (all in the repo now):**
- `.cargo/config.toml` (NEW file): `[target.x86_64-pc-windows-msvc] linker = "lld-link.exe"` — LLVM's multithreaded MSVC-compatible linker replaces the slow single-threaded `link.exe`. Biggest incremental-build win (linking dominates). Requires LLVM installed (`C:\Program Files\LLVM\bin\lld-link.exe`, on PATH — verified LLD 18.1.7). Also `[build] rustc-wrapper = "sccache"` and `[net] git-fetch-with-cli = true`.
- `sccache` 0.16.0 installed (`cargo install sccache --locked`, at `C:\Users\felix\.cargo\bin\sccache.exe`). Caches compiled crate artifacts across clean rebuilds/branch switches → the dep graph compiles ONCE. Server: `sccache --start-server`, stats: `sccache -s`. NOTE: sccache cannot cache INCREMENTAL crates, so our own 2 crates (using `incremental=true` below) are not sccache-cached (they use incremental instead) — deps ARE cached. This split is ideal; no error, sccache just skips incremental crates.
- Root `Cargo.toml` `[profile.dev]`: `opt-level=0`, `debug=1` (line-tables only → smaller objects → faster link, backtraces still work), `split-debuginfo="unpacked"` (debuginfo out of the binary → faster link), `codegen-units=256`, `incremental=true`.
- `[profile.dev.package."*"]`: `opt-level=2, debug=false, codegen-units=16` — dependencies compile ONCE at opt-2 so the app runs faster in dev (livekit codecs / image decode / crypto); slower FIRST build only (user accepted "one long build for the rest to be fast"). Our own crates stay opt-0 for fast recompile.
- `[profile.dev.build-override]`: `opt-level=0, debug=false, codegen-units=256` — proc-macro/build crates build fast (don't need runtime speed).

**Do NOT touch `[profile.release]`** (`lto="fat", codegen-units=1, opt-level=3, strip=true`) — release is intentionally slow for a fast/small binary; the dev-profile changes above don't affect it.

**Verify:** `sccache -s` shows cache hits growing on 2nd build; `cargo build -p fluxer-desktop` incremental links via lld. If lld-link ever breaks (version skew), fall back to bundled `rust-lld.exe` (ships with rustc) or comment the `linker` line. If sccache errors, comment `rustc-wrapper` in `.cargo/config.toml`.

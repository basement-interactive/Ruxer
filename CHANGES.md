# Build-Speed Optimization — Changelog

This file documents every change made to reduce build/compile/release time for
the Fluxer Desktop (Tauri) app. Each entry is dated and lists **what** changed,
**why**, the measured/expected **impact**, and how it was **verified**.

The repo was already heavily tuned before this effort (sccache, lld-link on
Windows / mold on Linux, `lto = false`, `codegen-units = 256`, opt-level
separation between dev-self and dev-deps, `incremental = false` to keep sccache
effective). The changes below are the *remaining* wins on top of that baseline.

---

## 2026-07-05

### A1. Removed `aws-lc-sys` from the dependency graph

- **Changed:** `core/Cargo.toml` — the `rustls` dependency went from
  `features = ["ring"]` to
  `default-features = false, features = ["ring", "logging", "std", "tls12"]`.
- **Why:** rustls 0.23's *default* features include `aws_lc_rs`, which
  unconditionally pulls `aws-lc-rs` → `aws-lc-sys`. `aws-lc-sys` builds AWS-LC
  (the AWS C crypto library) **from C source via `cmake` + `cc`** on every
  platform, a non-trivial native compile that sccache cannot help much with on
  first/clean builds. We never actually use the aws-lc provider —
  `crypto::ring::default_provider()` is what's installed at runtime (see the
  inline comment), and every transitive caller (reqwest `rustls-tls`,
  tokio-tungstenite `rustls-tls-webpki-roots`, livekit `rustls-tls-webpki-roots`)
  selects ring. The aws-lc compile was pure waste.
- **Impact:** `aws-lc-sys`, `aws-lc-rs`, `cmake`, and `fs_extra` all dropped out
  of the lockfile (834 → 830 packages). Removes a full cmake-driven C build from
  every clean/CI build and every `cargo clean`. The cmake binary itself is no
  longer needed in the Linux CI image as a rustls dependency (still used by
  `vendor/webrtc-sys`, so it stays installed there).
- **Verified by:**
  - `cargo tree -i aws-lc-sys` → `did not match any packages`
  - `cargo tree -i aws-lc-rs` → `did not match any packages`
  - `cargo tree -i cmake` → `did not match any packages`
  - `cargo build -p fluxer` succeeds; rustls + ring + rustls-webpki all compile
    and resolve correctly.
- **Risk notes:** if a future dependency turns `aws_lc_rs` back on through
  feature unification, `cargo tree -i aws-lc-sys` will reveal it. The fix is to
  add `default-features = false` to whichever dep re-introduces it.

### A2. sccache diagnostic scripts + verified cache health

- **Added:** `scripts/check-cache.sh` (bash, for WSL/Linux/macOS) and
  `scripts/check-cache.ps1` (PowerShell, for Windows). Both print
  `sccache --show-stats` after a build with a plain-English interpretation of
  what the numbers mean and what to check if the hit rate is low.
- **Why:** warm builds were reported as slow. sccache is the project's primary
  defense against re-compiling the ~830-crate graph, but it's invisible — if it
  silently stops caching (server died, wrong port, `incremental` flipped back on,
  `SCCACHE_DIR` on a wiped path), warm builds regress to "compile everything"
  with no obvious sign. These scripts make that failure mode a one-command check.
- **Verified (live diagnostic on this machine, 2026-07-05):**
  - sccache 0.16.0 is installed and the server is healthy on port 4227 (the port
    pinned in `.cargo/config.toml` to avoid the WSL2 `wslrelay.exe` 4226
    conflict — see that file's comment).
  - After `touch core/src/lib.rs && cargo build -p fluxer`, sccache recorded
    1 compile request, **1 cache hit (100%)**. So the wrapper IS intercepting
    rustc invocations and the cache IS being read.
  - Earlier "0 compile requests" readings were a red herring: a fully-cached
    no-op `cargo build` doesn't invoke rustc at all (Cargo short-circuits at the
    fingerprint stage), so sccache correctly has nothing to do. To measure the
    real hit rate you must force rustc to run (touch a source file, or
    `cargo clean -p <crate>`).
- **Conclusion for warm-build slowness:** sccache is NOT the culprit on this
  machine. If warm builds still feel slow, the likely causes are (a) the heavy
  native C/C++ crates — `webrtc-sys` (~30 C++ TUs), `ring` (C/asm),
  `mozjpeg-sys` (libjpeg-turbo C, via the `camera` feature) — which sccache
  caches per-TU but which are still individually slow, and/or (b) edits that
  invalidate large swaths of the workspace graph (e.g. changing a type in
  `core/src/models.rs` forces `src-tauri` + `voice-native` to recompile). The
  CI pipeline (Part B) sidesteps both by caching the whole `target/` dir.
- **Usage:** `./scripts/check-cache.sh` (or `.\scripts\check-cache.ps1`) after
  any build that felt slow. Aim for >80% cache hits on a 2nd build of unchanged
  code.

### A3. `windows`-crate version deduplication — investigated, deliberately NOT applied

- **Finding:** three `windows` major versions coexist in the lockfile:
  - `windows 0.54.0` ← pulled by `cpal` (audio) ← `rodio`. **Not dedupable** — cpal
    pins it; nothing in our `Cargo.toml` controls this.
  - `windows 0.61.3` ← `src-tauri` direct dep + the entire `tauri`/`tao`/`wry`
    runtime stack (which we don't control).
  - `windows 0.62.2` ← our `native-vendor/{encoder-ring,win-game-capture}`
    crates + `nokhwa-bindings-windows` (camera capture).
  - (Plus parallel `windows-core`, `windows-collections`, `windows-future`,
    `windows-link` splits at 0.61 vs 0.62 majors.)
- **Options considered:**
  1. Bump `src-tauri`'s direct `windows = "0.61"` → `0.62` to align with the
     native-vendor crates.
  2. Downgrade the native-vendor crates `windows = "0.62.2"` → `0.61` to align
     with src-tauri.
- **Decision: NEITHER.** Reasons:
  1. **Marginal gain.** Option (1) would NOT eliminate `windows 0.61` — the
     tauri/tao/wry runtime still pulls 0.61 internally, so we'd only save the
     one direct-dep codegen unit (the API surface behind our explicit feature
     list). That's small.
  2. **Real breakage risk.** `src-tauri` uses the `#[implement]` proc-macro,
     which generates code referencing `windows_core::*` paths by name, and
     depends on `webview2-com = "0.38"` (pinned to the 0.61-era `windows` API).
     The native-vendor crates use `Graphics_Capture` features whose surface
     shifted between 0.61 and 0.62. Crossing versions risks subtle compile or
     runtime breakage in the screen-share / webview2-suppression paths — exactly
     the fiddly platform code that's hardest to debug.
  3. **Already mitigated.** These crates are sccache-cached after the first
     build (verified in A2), and the CI pipeline (Part B) caches the entire
     `target/` dir via `Swatinem/rust-cache`. The cold-build cost is paid once;
     the warm cost is near-zero regardless of how many majors coexist.
- **If revisited later:** the lowest-risk path would be option (1), and only
  after upgrading `tauri` itself to a release whose `tao`/`wry` transitively
  use `windows 0.62` — at that point aligning src-tauri's direct dep is free.
  Until then, the duplication is intentional and documented here.

### Part C. Frontend rebuild skip (`scripts/maybe-rebuild-frontend.mjs`)

- **Added:** `scripts/maybe-rebuild-frontend.mjs` — a cross-platform Node script
  that skips the ~34s rspack rebuild when the reference client source hasn't
  changed.
- **Why:** the shipped frontend (`reference/fluxer/fluxer_app`) takes ~30-60s to
  rebuild (rspack production build + the `tauri-postbuild.mjs` network fetch +
  the ~231 MB `dist` → `web/dist` copy). Most builds — local dev iteration, CI
  runs that only touch Rust — rebuild it pointlessly. This script makes the
  rebuild content-addressed: hash the inputs, skip if unchanged.
- **How it works:**
  - Hashes (SHA-256, content-addressed — not mtime-based, so it's stable across
    git checkouts and CI runners): `fluxer_app/{src,scripts}/**`,
    `package.json`, `pnpm-lock.yaml`, `rspack.config.mjs`, optional
    `tsconfig.json`/`postcss.config.*`, plus the script itself.
  - Compares to `web/.dist-hash`. Match → exit 0 (skip). Mismatch or missing →
    run the full pipeline (`rspack build` → `tauri-postbuild.mjs` →
    `tauri-stage.mjs`), then write the new hash.
  - `--force` flag bypasses the cache for a guaranteed rebuild.
- **Verified (2026-07-05):**
  - Hashing is deterministic: 4,243 files / ~116 MB → identical hash across
    repeated runs.
  - Skip path: 2nd run with unchanged source → `web/dist is current ...
    Skipping rebuild.` in **0.89s** (vs **33.59s** for rspack alone, plus
    postbuild + stage).
  - Invalidation: appending one line to `src/index.tsx` → `inputs changed ...
    Rebuilding.` detected correctly. Removing it → hash restored, skip resumes.
  - `--force` runs the full pipeline end-to-end (rspack + postbuild + stage)
    and records the hash.
- **Impact:** saves ~34-60s on every build where the frontend is unchanged —
  which is most Rust-iteration builds locally and most CI runs. CI (Part B)
  calls this script instead of running rspack unconditionally.
- **Usage:** `node scripts/maybe-rebuild-frontend.mjs` (add `--force` to
  rebuild regardless). The script auto-detects pnpm vs npm vs yarn and uses the
  project-local `node_modules/.bin/rspack` binary (matches the AGENTS.md flow).

### Part B. GitHub Actions release pipeline (`.github/workflows/release.yml`)

- **Added:** `.github/workflows/release.yml` — a two-stage release pipeline that
  builds the Windows MSI and Linux AppImage **in parallel on separate runners**
  and publishes them to a GitHub Release.
- **Why this is the centerpiece:** the local hand-build ran Windows natively and
  Linux in WSL **on the same machine**, so the two platforms built **serially**
  with shared CPU and disk contention — that's the structural cause of the 5-10
  minute wall time. Moving to CI gives true parallelism (separate runners,
  independent CPUs) AND persistent caching (so warm builds skip the heavy native
  compiles entirely). Your machine is free during releases.
- **Trigger:** push a `v*` tag (`git tag v0.3.2 && git push origin v0.3.2`).
  Also supports `workflow_dispatch` from the Actions tab for test/rebuild runs
  (which build + upload artifacts but don't publish).
- **Pipeline shape:**
  1. **`build` matrix job** (Windows + Linux in parallel):
     - Checkout → pnpm + Node (cached) → `node scripts/maybe-rebuild-frontend.mjs`
       (skips rspack when frontend unchanged — see Part C).
     - Rust toolchain (`dtolnay/rust-toolchain@stable`) → sccache
       (`mozilla-actions/sccache-action`, GHA backend) → `Swatinem/rust-cache`
       for the `target/` dir → explicit cache for `tauri-cli` install.
     - Linux: apt-cache for webkit2gtk-4.1, appindicator, **clang + mold**
       (the `.cargo/config.toml` fast linker), nasm (mozjpeg-sys via camera),
       cmake (webrtc-sys C++), librsvg2. `ubuntu-22.04` NOT `ubuntu-latest`
       (24.04's glibc breaks AppImage portability).
     - Windows: choco install LLVM (for `lld-link.exe`), NASM, cmake.
     - Cache for the ~110 MB libwebrtc download (keyed on the git rev in
       `Cargo.toml`'s `[patch]` section, so it invalidates when revs move).
     - `cargo tauri build` with `TAURI_SIGNING_PRIVATE_KEY` env injected so the
       `.sig` files are produced for the in-app updater.
     - Upload the bundle dir (`msi/*` or `appimage/*`) as a build artifact.
  2. **`release` job** (`needs: [build]`, runs only on tag pushes):
     - Downloads both platform artifacts.
     - Stages `latest.json` (the updater manifest) at the release root.
     - `softprops/action-gh-release@v2` creates/updates the GitHub Release for
       the tag with `generate_release_notes: true` (auto changelog from commits).
- **NVENC note:** the CUDA/NVENC arm of `webrtc-sys/build.rs` is OFF in CI
  (`CUDA_HOME` unset → build.rs skips it). CI produces the standard non-NVENC
  build — identical to what a release without an NVIDIA encoder box would get.
  NVENC users self-build locally. This keeps CI on GitHub-hosted (GPU-less)
  runners.
- **Expected timings:**
  - **Cold first run** (no caches): ~15-25 min per platform, **running in
    parallel** → wall-clock ≈ the slower of the two.
  - **Warm** (caches populated): ~3-6 min per platform, in parallel → wall-clock
    ≈ 3-6 min. This is the steady-state "as fast as possible."

### Required GitHub repo secrets (set these before the first tagged release)

The in-app updater needs installers cryptographically signed with the keypair in
`.tauri-signing/`. CI needs the PRIVATE key to sign. Add two repo secrets
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret name | Value | Where it comes from |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | the full contents of `.tauri-signing/ruxer.key` (PEM, including `-----BEGIN ...-----` headers) | `cat .tauri-signing/ruxer.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you set when generating the key | whatever you used with `tauri signer generate` |

The public key (`ruxer.key.pub`) is already embedded in `tauri.conf.json`
(`plugins.updater.pubkey`), so the client side needs no changes.

> ⚠️ **The signing key is a release-critical secret.** Anyone with repository
> `write` access can read these secrets in a workflow run. If you ever leak the
> key, regenerate it (`tauri signer generate -w ~/.tauri/ruxer.key`), update the
> pubkey in `tauri.conf.json`, and ship a release that updates clients to the
> new key — old clients will refuse updates signed by the leaked key otherwise.

### How to cut a release (the new flow)

```bash
# 1. Make sure web/dist is current (run locally; CI also runs this and skips if unchanged):
node scripts/maybe-rebuild-frontend.mjs

# 2. Bump the version in src-tauri/tauri.conf.json (the `version` field) and
#    src-tauri/Cargo.toml, then commit.

# 3. Tag and push:
git tag v0.3.2
git push origin v0.3.2

# 4. Watch the Actions tab. ~3-6 min after both jobs go green, the GitHub
#    Release for v0.3.2 appears with MSI + AppImage + .sig + latest.json.
#    The in-app updater picks it up automatically.
```

To test the build without publishing, use **Actions → release → Run workflow**
(`workflow_dispatch`). It builds and uploads artifacts but skips the release
step (gated on `startsWith(github.ref, 'refs/tags/')`).

### Verification done in this session

- `cargo build -p fluxer-desktop --lib` succeeds on the host after the A1
  (aws-lc removal) change — 4m45s cold, confirming the rustls/ring TLS path
  works end-to-end through reqwest, tokio-tungstenite, livekit, and the updater.
- sccache confirmed working: 100% hit on a cached single-crate rebuild (A2). The
  0% hit during the full desktop build is expected (those crates were new to the
  local cache; they're hits on the next build and in CI's persistent cache).
- Workflow YAML validated (parses cleanly).
- The libwebrtc cache key rev in the workflow matches the `[patch]` rev in
  `Cargo.toml` (`95187dff9324e474ebb27a6ee7d2213f9a1caad3`).

_Ongoing. Entries are appended as each change lands._

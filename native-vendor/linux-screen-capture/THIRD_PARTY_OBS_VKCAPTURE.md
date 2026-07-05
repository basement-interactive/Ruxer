<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# obs-vkcapture Runtime Assets

Fluxer can launch Linux games with OBS-compatible Vulkan/OpenGL capture enabled.
The Fluxer code in this package does not include obs-vkcapture source code; it only
sets launch environment variables and speaks the OBS-compatible capture socket
protocol implemented by the Rust backend.

The Rust receiver treats OBS import modes as a fallback ladder:

- `default-dmabuf`, `no-modifiers-dmabuf`, and `linear-dmabuf` request GPU
  DMA-BUF descriptors from the hook. Until a local GPU importer validates those
  descriptors end to end, Fluxer reports them as requested rather than available.
- `linear-host-mapped-dmabuf` is the conservative CPU fallback. Frames carry an
  NV12 CPU payload, and may also expose source texture DMA-BUF metadata so the
  downstream native WebRTC layer can opportunistically try GPU import before
  falling back to the CPU payload.
- Unsupported host-mapped layouts, invalid file descriptors, unsupported fourcc
  values, and invalid strides/offsets must surface as lifecycle diagnostics and
  must not be treated as successful capture.

If Fluxer ships obs-vkcapture hook binaries under `obs-vkcapture/`, treat those
files as a separate third-party runtime component. The upstream project currently
ships GNU GPL version 2 license text, and distro metadata may label the package as
GPL-2.0-or-later. Use the more conservative GPL-2.0 boundary unless upstream
files in the vendored revision clearly state otherwise.

Distribution checklist for bundled hook assets:

- Keep the obs-vkcapture binaries and manifests under `obs-vkcapture/`.
- Include the exact upstream license text and copyright notices next to the
  bundled assets.
- Record the upstream repository URL, revision, local patches, and build script.
- Provide corresponding source for the exact shipped binaries, or a compliant
  written source offer when applicable.
- Keep package metadata including `THIRD_PARTY_OBS_VKCAPTURE.md` and
  `obs-vkcapture/**/*`; loader tests assert those package entries.
- Do not copy obs-vkcapture implementation code into AGPL-licensed Fluxer modules
  unless the license compatibility has been explicitly reviewed.

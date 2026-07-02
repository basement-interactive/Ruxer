# Ruxer

Distribution repository for **Ruxer**, a Tauri-based desktop client for Fluxer.

This repo hosts the release artifacts consumed by the app's built-in auto-updater:

- **Windows**: `Ruxer_<version>_x64_en-US.msi` (+ `.sig` updater signature)
- **Linux**: `Ruxer_<version>_amd64.AppImage` (+ `.sig` updater signature)
- `latest.json` — the update manifest the app polls at
  `https://github.com/89hbuy2f3bh872d/Ruxer/releases/latest/download/latest.json`

Releases are produced and uploaded by the Ruxer build GUI (`build-gui/` in the
source tree). Each release is tagged `v<version>`; installers are signed with
the project's updater key and verified in-app before installing.

## Installing

Grab the latest installer for your platform from the
[Releases](https://github.com/89hbuy2f3bh872d/Ruxer/releases/latest) page.
The app keeps itself up to date automatically afterwards.

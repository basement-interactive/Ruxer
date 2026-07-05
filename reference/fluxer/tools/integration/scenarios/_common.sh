#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

if [ -z "${INTEGRATION_HARNESS_ROOT:-}" ]; then
    SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    INTEGRATION_HARNESS_ROOT="$(cd "${SCENARIO_DIR}/.." && pwd)"
fi
export INTEGRATION_HARNESS_ROOT

INTEGRATION_REPO_ROOT="$(cd "${INTEGRATION_HARNESS_ROOT}/../.." && pwd)"
export INTEGRATION_REPO_ROOT

detect_platform() {
    local uname_out
    uname_out="$(uname -s 2>/dev/null || echo unknown)"
    case "$uname_out" in
        Darwin) echo "macos" ;;
        Linux) echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*|Windows_NT) echo "windows" ;;
        *)
            if [ -n "${OS:-}" ] && [ "$OS" = "Windows_NT" ]; then
                echo "windows"
            else
                echo "unknown"
            fi
            ;;
    esac
}

driver_target_dir() {
    local platform="$1"
    echo "${INTEGRATION_HARNESS_ROOT}/integration-driver/target-${platform}"
}

driver_binary_path() {
    local platform="$1"
    local target_dir
    target_dir="$(driver_target_dir "$platform")"
    if [ "$platform" = "windows" ]; then
        echo "${target_dir}/debug/integration-driver.exe"
    else
        echo "${target_dir}/debug/integration-driver"
    fi
}

driver_binary_runs() {
    local binary="$1"
    if [ ! -f "$binary" ]; then
        return 1
    fi
    if "$binary" --help >/dev/null 2>&1; then
        return 0
    fi
    if "$binary" 2>/dev/null | head -c 1 >/dev/null; then
        return 0
    fi
    return 1
}

ensure_driver_built() {
    local platform
    platform="$(detect_platform)"
    local binary
    binary="$(driver_binary_path "$platform")"
    local target_dir
    target_dir="$(driver_target_dir "$platform")"
    if ! driver_binary_runs "$binary"; then
        ( cd "${INTEGRATION_HARNESS_ROOT}/integration-driver" && CARGO_TARGET_DIR="$target_dir" cargo build >&2 ) || return $?
    fi
    if [ ! -f "$binary" ]; then
        printf '{"schema":1,"scenario":"%s","platform":"%s","status":"fail","measurements":{"reason":"driver binary missing after build"},"assertions":[]}\n' \
            "${SCENARIO_NAME:-unknown}" "$platform"
        return 70
    fi
    echo "$binary"
}

run_rust_subcommand() {
    local subcommand="$1"
    shift || true
    local binary
    binary="$(ensure_driver_built)" || return $?
    "$binary" "$subcommand" "$@"
}

run_ts_driver() {
    local entry="$1"
    shift || true
    local resolved="${INTEGRATION_REPO_ROOT}/${entry}"
    if [ ! -f "$resolved" ]; then
        printf '{"schema":1,"scenario":"%s","platform":"%s","status":"fail","measurements":{"reason":"ts driver entry missing: %s"},"assertions":[]}\n' \
            "${SCENARIO_NAME:-unknown}" "$(detect_platform)" "$resolved"
        return 70
    fi
    local pnpm_command
    pnpm_command="$(resolve_pnpm_command)" || {
        printf '{"schema":1,"scenario":"%s","platform":"%s","status":"fail","measurements":{"reason":"pnpm not available"},"assertions":[]}\n' \
            "${SCENARIO_NAME:-unknown}" "$(detect_platform)"
        return 70
    }
    if should_use_dlx_tsx; then
        ( cd "$INTEGRATION_REPO_ROOT" && $pnpm_command dlx tsx "$entry" "$@" )
    elif ( cd "$INTEGRATION_REPO_ROOT" && $pnpm_command exec tsx --version >/dev/null 2>&1 ); then
        ( cd "$INTEGRATION_REPO_ROOT" && $pnpm_command exec tsx "$entry" "$@" )
    else
        ( cd "$INTEGRATION_REPO_ROOT" && $pnpm_command dlx tsx "$entry" "$@" )
    fi
}

resolve_pnpm_command() {
    if command -v pnpm >/dev/null 2>&1; then
        echo "pnpm"
        return 0
    fi
    if command -v corepack >/dev/null 2>&1; then
        echo "corepack pnpm"
        return 0
    fi
    return 1
}

should_use_dlx_tsx() {
    if [ "${FLUXER_INTEGRATION_TSX_MODE:-}" = "dlx" ]; then
        return 0
    fi
    case "$INTEGRATION_REPO_ROOT" in
        /media/psf/*|/mnt/psf/*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

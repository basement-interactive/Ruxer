#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

PLATFORM=""
ONLY_SCENARIO=""
DRY_RUN="0"

for arg in "$@"; do
    case "$arg" in
        --platform=*) PLATFORM="${arg#--platform=}" ;;
        --only=*) ONLY_SCENARIO="${arg#--only=}" ;;
        --dry-run) DRY_RUN="1" ;;
        -h|--help)
            cat <<'EOF'
usage: runner.sh --platform=<macos|linux-fedora|windows-tailnet|windows-vm> [--only=<scenario>] [--dry-run]

  --platform=NAME    Required. Selects the harness matrix entry.
  --only=NAME        Optional. Run a single scenario (script basename without .sh).
  --dry-run          Print which scenarios would run without invoking them.
EOF
            exit 0
            ;;
        *)
            printf 'runner.sh: unknown argument %s\n' "$arg" >&2
            exit 64
            ;;
    esac
done

if [ -z "$PLATFORM" ]; then
    printf 'runner.sh: --platform=<name> is required\n' >&2
    exit 64
fi

RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${RUNNER_DIR}/results"
SCENARIOS_DIR="${RUNNER_DIR}/scenarios"
mkdir -p "$RESULTS_DIR"

case "$PLATFORM" in
    macos)
        SCENARIO_LIST=(
            scenario_audio_capture_to_mix
            scenario_screen_capture_to_pool
            scenario_gpu_device_loss_recovery
            scenario_event_log_replay_determinism
            scenario_ffi_airlock_negative_space
            scenario_encoder_handoff_dryrun
        )
        ;;
    linux-fedora)
        SCENARIO_LIST=(
            scenario_audio_capture_to_mix
            scenario_screen_capture_to_pool
            scenario_gpu_device_loss_recovery
            scenario_event_log_replay_determinism
            scenario_ffi_airlock_negative_space
            scenario_encoder_handoff_dryrun
        )
        ;;
    windows-tailnet)
        SCENARIO_LIST=(
            scenario_audio_capture_to_mix
            scenario_screen_capture_to_pool
            scenario_gpu_device_loss_recovery
            scenario_event_log_replay_determinism
            scenario_ffi_airlock_negative_space
            scenario_encoder_handoff_dryrun
        )
        ;;
    windows-vm)
        SCENARIO_LIST=(
            scenario_audio_capture_to_mix
            scenario_screen_capture_to_pool
            scenario_event_log_replay_determinism
            scenario_ffi_airlock_negative_space
            scenario_encoder_handoff_dryrun
        )
        ;;
    *)
        printf 'runner.sh: unknown platform %s; expected macos|linux-fedora|windows-tailnet|windows-vm\n' "$PLATFORM" >&2
        exit 64
        ;;
esac

if [ -n "$ONLY_SCENARIO" ]; then
    FILTERED=()
    for s in "${SCENARIO_LIST[@]}"; do
        if [ "$s" = "$ONLY_SCENARIO" ]; then
            FILTERED+=("$s")
        fi
    done
    SCENARIO_LIST=("${FILTERED[@]}")
    if [ "${#SCENARIO_LIST[@]}" -eq 0 ]; then
        printf 'runner.sh: scenario %s not in platform matrix for %s\n' "$ONLY_SCENARIO" "$PLATFORM" >&2
        exit 64
    fi
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_FILE="${RESULTS_DIR}/${PLATFORM}-${TIMESTAMP}.json"
SUMMARY_FILE="${RESULTS_DIR}/latest-summary.txt"

if [ "$DRY_RUN" = "1" ]; then
    printf 'Would run on platform=%s:\n' "$PLATFORM"
    for s in "${SCENARIO_LIST[@]}"; do
        printf '  %s\n' "$s"
    done
    exit 0
fi

PASSED=0
FAILED=0
RESULT_ENTRIES=()
SUMMARY_LINES=()

emit_result_entry() {
    local scenario="$1"
    local status="$2"
    local body="$3"
    local entry
    entry="{\"scenario\":\"${scenario}\",\"status\":\"${status}\",\"output\":${body}}"
    RESULT_ENTRIES+=("$entry")
}

for scenario in "${SCENARIO_LIST[@]}"; do
    script="${SCENARIOS_DIR}/${scenario}.sh"
    if [ ! -x "$script" ]; then
        chmod +x "$script" 2>/dev/null || true
    fi
    if [ ! -f "$script" ]; then
        emit_result_entry "$scenario" "missing" "{\"reason\":\"scenario script not found at ${script}\"}"
        SUMMARY_LINES+=("[MISS] ${scenario}")
        FAILED=$((FAILED + 1))
        continue
    fi
    set +e
    raw_output="$("$script" 2>&1)"
    exit_code=$?
    set -e
    last_json_line="$(printf '%s\n' "$raw_output" | awk '/^\{.*\}$/ {last=$0} END {print last}')"
    if [ -z "$last_json_line" ]; then
        emit_result_entry "$scenario" "fail" "{\"reason\":\"scenario produced no JSON line\",\"raw\":$(jq -Rs . <<<"$raw_output" 2>/dev/null || echo '\"<unparseable>\"')}"
        SUMMARY_LINES+=("[FAIL] ${scenario} (no json)")
        FAILED=$((FAILED + 1))
        continue
    fi
    if [ "$exit_code" -eq 0 ]; then
        emit_result_entry "$scenario" "pass" "$last_json_line"
        SUMMARY_LINES+=("[PASS] ${scenario}")
        PASSED=$((PASSED + 1))
    else
        emit_result_entry "$scenario" "fail" "$last_json_line"
        SUMMARY_LINES+=("[FAIL] ${scenario} (exit ${exit_code})")
        FAILED=$((FAILED + 1))
    fi
done

ENTRIES_JOINED="$(IFS=,; echo "${RESULT_ENTRIES[*]}")"
printf '{"schema":1,"platform":"%s","timestamp":"%s","passed":%d,"failed":%d,"results":[%s]}\n' \
    "$PLATFORM" "$TIMESTAMP" "$PASSED" "$FAILED" "$ENTRIES_JOINED" > "$RESULT_FILE"

{
    printf 'platform: %s\n' "$PLATFORM"
    printf 'timestamp: %s\n' "$TIMESTAMP"
    printf 'passed: %d\n' "$PASSED"
    printf 'failed: %d\n' "$FAILED"
    printf 'scenarios:\n'
    for line in "${SUMMARY_LINES[@]}"; do
        printf '  %s\n' "$line"
    done
    printf 'result_file: %s\n' "$RESULT_FILE"
} > "$SUMMARY_FILE"

cat "$SUMMARY_FILE"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
exit 0

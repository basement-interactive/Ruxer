#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

SCENARIO_NAME="scenario_event_log_replay_determinism"
export SCENARIO_NAME

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

EXPECTED_FILE="${INTEGRATION_HARNESS_ROOT}/expected/event_log_replay_determinism.json"
EXPECTED_HASH=""
if [ -f "$EXPECTED_FILE" ]; then
    EXPECTED_HASH="$(grep -E '"snapshot_hash"' "$EXPECTED_FILE" | head -1 | sed -E 's/.*"snapshot_hash"[^"]*"([^"]+)".*/\1/' || true)"
fi

if [ -n "$EXPECTED_HASH" ]; then
    run_ts_driver "tools/integration/ts-driver/event_log_replay_determinism.ts" "$EXPECTED_HASH"
else
    run_ts_driver "tools/integration/ts-driver/event_log_replay_determinism.ts"
fi

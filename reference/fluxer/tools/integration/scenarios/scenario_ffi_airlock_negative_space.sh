#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

SCENARIO_NAME="scenario_ffi_airlock_negative_space"
export SCENARIO_NAME

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

run_rust_subcommand "ffi-airlock-negative" "invalid-sample-rate"

#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

SCENARIO_NAME="scenario_encoder_handoff_dryrun"
export SCENARIO_NAME

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

run_rust_subcommand "encoder-handoff-dryrun"

#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -u
set -o pipefail

INTEGRATION_TRANSFER_LIB_LOADED=1

integration_transfer_b64_encode() {
    local src_path="$1"
    if [ ! -f "$src_path" ]; then
        printf 'integration_transfer: missing source %s\n' "$src_path" >&2
        return 64
    fi
    if command -v base64 >/dev/null 2>&1; then
        base64 < "$src_path" | tr -d '\n'
    else
        printf 'integration_transfer: base64 not available\n' >&2
        return 64
    fi
}

integration_transfer_ssh_write_text() {
    local ssh_target="$1"
    local password="$2"
    local dest_path="$3"
    local src_path="$4"
    local encoded
    encoded="$(integration_transfer_b64_encode "$src_path")" || return $?
    local powershell_cmd
    powershell_cmd="\$bytes = [System.Convert]::FromBase64String('${encoded}'); [System.IO.File]::WriteAllBytes('${dest_path}', \$bytes)"
    if command -v sshpass >/dev/null 2>&1; then
        sshpass -p "$password" ssh -o StrictHostKeyChecking=accept-new "$ssh_target" "powershell -NoProfile -Command \"${powershell_cmd}\""
    else
        ssh -o StrictHostKeyChecking=accept-new "$ssh_target" "powershell -NoProfile -Command \"${powershell_cmd}\""
    fi
}

integration_transfer_ssh_run() {
    local ssh_target="$1"
    local password="$2"
    local command_line="$3"
    if command -v sshpass >/dev/null 2>&1; then
        sshpass -p "$password" ssh -o StrictHostKeyChecking=accept-new "$ssh_target" "$command_line"
    else
        ssh -o StrictHostKeyChecking=accept-new "$ssh_target" "$command_line"
    fi
}

integration_transfer_ssh_powershell() {
    local ssh_target="$1"
    local password="$2"
    local powershell_script="$3"
    integration_transfer_ssh_run "$ssh_target" "$password" "powershell -NoProfile -Command \"${powershell_script}\""
}

integration_transfer_prlctl_exec() {
    local vm_name="$1"
    local command_line="$2"
    if ! command -v prlctl >/dev/null 2>&1; then
        printf 'integration_transfer: prlctl not available\n' >&2
        return 64
    fi
    prlctl exec "$vm_name" "$command_line"
}

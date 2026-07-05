#!/usr/bin/env bash
# scripts/check-cache.sh — print the sccache hit-rate report for the most recent
# build(s). Use this AFTER a `cargo build` to confirm sccache is actually caching.
#
# Expected on a warm build: get/Cache hits well above 80%. If you see 0% hits or
# "CannotCache(incremental)", sccache is not helping and your warm builds are
# slower than they should be — see CHANGES.md (entry A2) for the checklist.
#
# Why this exists: the project deliberately sets `incremental = false` in
# [profile.dev] / [profile.release] so that sccache can cache every unit (sccache
# refuses to cache units compiled with -C incremental). If something flips that
# back on, or sccache isn't on PATH, warm builds silently regress to "compile
# everything". This script makes that failure mode visible in one command.
set -euo pipefail

if ! command -v sccache >/dev/null 2>&1; then
  echo "sccache is NOT on PATH. Install it (cargo install sccache) and set"
  echo "[build] rustc-wrapper = \"sccache\" in .cargo/config.toml — otherwise"
  echo "nothing is being cached and warm builds recompile the whole graph."
  exit 1
fi

echo "=== sccache server status ==="
sccache --show-stats
echo
echo "=== interpretation guide ==="
echo "  * 'Cache hits' should dominate on a 2nd+ build (aim for >80%)."
echo "  * 'Cache misses' are normal on the first build of a crate."
echo "  * If you see 'CannotCache(incremental)' → incremental compilation is"
echo "    on somewhere; check [profile.*] incremental flags in Cargo.toml."
echo "  * If hits are 0% on a warm build → SCCACHE_DIR may be on a path that"
echo "    gets wiped between builds, or the server died (sccache --stop-server"
echo "    then sccache --start-server)."

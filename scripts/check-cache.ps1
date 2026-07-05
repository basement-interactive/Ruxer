# scripts/check-cache.ps1 — Windows PowerShell equivalent of check-cache.sh.
# Prints the sccache hit-rate report after a build. Run after `cargo build`.
#
# Expected on a warm build: cache hits well above 80%. See CHANGES.md (A2).
$ErrorActionPreference = "Stop"

if (-not (Get-Command sccache -ErrorAction SilentlyContinue)) {
    Write-Host "sccache is NOT on PATH." -ForegroundColor Red
    Write-Host "Install it (cargo install sccache) and set [build] rustc-wrapper = `"sccache`""
    Write-Host "in .cargo/config.toml — otherwise nothing is cached and warm builds"
    Write-Host "recompile the whole graph."
    exit 1
}

Write-Host "=== sccache server status ===" -ForegroundColor Cyan
sccache --show-stats

Write-Host ""
Write-Host "=== interpretation guide ===" -ForegroundColor Cyan
Write-Host "  * 'Cache hits' should dominate on a 2nd+ build (aim for >80%)."
Write-Host "  * 'Cache misses' are normal on the first build of a crate."
Write-Host "  * 'CannotCache(incremental)' => incremental compilation is on somewhere;"
Write-Host "    check [profile.*] incremental flags in Cargo.toml."
Write-Host "  * 0% hits on a warm build => SCCACHE_DIR may be wiped between builds,"
Write-Host "    or the server died (sccache --stop-server; sccache --start-server)."

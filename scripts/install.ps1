# Build Stark and install it over the app the Desktop shortcut runs.
#
# There were three divergent copies of stark.exe on this machine at one point —
# the installed app, a loose copy on the Desktop, and the repo build — and it
# was not obvious which one was running. This makes updating one command so
# they cannot drift apart again.
#
#   pnpm run install:app
#
# The Start Menu and Desktop shortcuts already point at the install directory,
# so they need no changes.

$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent $PSScriptRoot
$built   = Join-Path $repo 'apps\desktop\src-tauri\target\release\stark.exe'
$destDir = Join-Path $env:LOCALAPPDATA 'Stark'
$dest    = Join-Path $destDir 'stark.exe'

# The build cannot replace a running exe: cargo fails with "Access is denied".
$running = Get-Process stark -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Stopping the running Stark...'
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host 'Building...'
Push-Location $repo
try {
    # tauri build, not cargo build: only the Tauri CLI embeds the frontend.
    # A plain cargo --release binary falls back to the dev server URL and shows
    # "can't reach this page" with no dev server running.
    & pnpm --filter stark-desktop tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}

if (-not (Test-Path $built)) { throw "built exe not found at $built" }

New-Item -ItemType Directory -Force $destDir | Out-Null
Copy-Item $built $dest -Force

$i = Get-Item $dest
Write-Host ''
Write-Host "Installed: $dest"
Write-Host ("           {0}  {1:N1} MB" -f $i.LastWriteTime, ($i.Length / 1MB))

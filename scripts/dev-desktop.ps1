$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."

Write-Host "=== Starting LifeOS Desktop (Electron) in Dev Mode ==="
node "$Root\scripts\dev.mjs"


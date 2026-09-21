$ErrorActionPreference = "Stop"

$CargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $CargoBin) {
    $env:Path = "$CargoBin;$env:Path"
}

$Root = Resolve-Path "$PSScriptRoot\.."
$DesktopDir = "$Root\apps\desktop"

Write-Host "=== Starting LifeOS Desktop in Dev Mode ==="
Write-Host "Connecting to active dev server at http://localhost:3000..."

Push-Location "$DesktopDir"
try {
    pnpm tauri dev --no-watch
} finally {
    Pop-Location
}

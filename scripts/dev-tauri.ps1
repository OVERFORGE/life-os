$ErrorActionPreference = "Stop"

$CargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $CargoBin) {
    $env:Path = "$CargoBin;$env:Path"
}

$Root = Resolve-Path "$PSScriptRoot\.."
$TauriDir = "$Root\apps\desktop\src-tauri"

Write-Host "=== Starting LifeOS Desktop (Tauri) ==="

# If the debug executable is already compiled, launch it directly, or build via cargo run
$ExistingExe = "$TauriDir\target\debug\desktop.exe"
if (Test-Path $ExistingExe) {
    Write-Host "Launching existing Tauri build ($ExistingExe)..."
    Start-Process -FilePath $ExistingExe
} else {
    Push-Location "$TauriDir"
    try {
        cargo run
    } finally {
        Pop-Location
    }
}

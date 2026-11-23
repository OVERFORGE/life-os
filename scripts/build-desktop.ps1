$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$DesktopDir = "$Root\apps\desktop"
$ToolsDir = "$Root\tools\aven-wake-detector"

Write-Host "=== LifeOS Desktop (Electron) Build Pipeline ==="

# 1. Build Rust Wake Detector CLI
Write-Host "[1/3] Building Aven Wake Word Detector binary..."
Push-Location "$ToolsDir"
try {
    cargo build --release
} finally {
    Pop-Location
}

# 2. Compile Electron TypeScript
Write-Host "[2/3] Compiling Electron main and preload bundles..."
Push-Location "$DesktopDir"
try {
    pnpm run build
} finally {
    Pop-Location
}

# 3. Package Electron Application
Write-Host "[3/3] Packaging Electron Desktop application..."
Push-Location "$DesktopDir"
try {
    pnpm run package
} finally {
    Pop-Location
}

Write-Host "=== Electron Desktop Build Complete ==="

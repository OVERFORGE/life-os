$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$DesktopDir = "$Root\apps\desktop"
$WebDir = "$Root\apps\web"
$BinDir = "$DesktopDir\src-tauri\bin"
$ResourcesDir = "$DesktopDir\src-tauri\resources\web"

Write-Host "=== LifeOS Desktop Build Pipeline ==="

# 1. Download Node.js sidecar binary
if (-Not (Test-Path "$BinDir")) {
    New-Item -ItemType Directory -Force -Path "$BinDir" | Out-Null
}

$NodeExePath = "$BinDir\node-x86_64-pc-windows-msvc.exe"
if (-Not (Test-Path $NodeExePath)) {
    Write-Host "[1/5] Downloading Node.js binary for Sidecar..."
    $NodeUrl = "https://nodejs.org/dist/v20.12.2/win-x64/node.exe"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeExePath
    Write-Host "Downloaded Node.js binary successfully."
} else {
    Write-Host "[1/5] Node.js binary already exists. Skipping download."
}

# 2. Build Next.js Application
Write-Host "[2/5] Building Next.js Web App in standalone mode..."
Push-Location "$Root\apps\web"
pnpm run build
Pop-Location

# 3. Bundle Resources
Write-Host "[3/5] Bundling standalone resources..."
if (Test-Path "$ResourcesDir") {
    Remove-Item -Recurse -Force "$ResourcesDir"
}
New-Item -ItemType Directory -Force -Path "$ResourcesDir" | Out-Null

Write-Host "  Copying standalone output..."
Copy-Item -Recurse -Force "$WebDir\.next\standalone\*" "$ResourcesDir"

Write-Host "  Copying static assets..."
$StaticDir = "$ResourcesDir\apps\web\.next\static"
New-Item -ItemType Directory -Force -Path $StaticDir | Out-Null
Copy-Item -Recurse -Force "$WebDir\.next\static\*" $StaticDir

Write-Host "  Copying public folder..."
$PublicDir = "$ResourcesDir\apps\web\public"
New-Item -ItemType Directory -Force -Path $PublicDir | Out-Null
Copy-Item -Recurse -Force "$WebDir\public\*" $PublicDir

Write-Host "  Copying .env for local testing..."
if (Test-Path "$WebDir\.env") {
    Copy-Item -Force "$WebDir\.env" "$ResourcesDir\.env"
}

# 4. Copy Server Bootstrapper
Write-Host "[4/5] Preparing start.cjs bootstrapper..."
Copy-Item -Force "$DesktopDir\start.cjs" "$ResourcesDir\start.cjs"

Write-Host "Build pipeline preparation complete! Compiling Tauri Native executable..."
Push-Location "$DesktopDir"
pnpm tauri build
Pop-Location
Write-Host "=== Desktop Production Build Complete! ==="

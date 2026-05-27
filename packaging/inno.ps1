$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ISCC = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ISCC) {
    throw "Inno Setup 6 compiler ISCC.exe was not found. Install Inno Setup 6, then run this command again."
}

& $ISCC ".\packaging\installer\AutocomBridge.iss"

if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup installer compilation failed with exit code $LASTEXITCODE."
}

Write-Host "Final installer build completed." -ForegroundColor Green
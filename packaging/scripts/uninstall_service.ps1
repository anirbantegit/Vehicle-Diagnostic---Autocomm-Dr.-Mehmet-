$ErrorActionPreference = "SilentlyContinue"

$InstallDir = Split-Path -Parent $PSScriptRoot
$ServiceNames = @("DiagnosticEngineConsoleService", "AutocomBridgeService")
$Nssm = Join-Path $InstallDir "tools\nssm.exe"

foreach ($ServiceName in $ServiceNames) {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        & $Nssm stop $ServiceName | Out-Null
        Start-Sleep -Seconds 2
        & $Nssm remove $ServiceName confirm | Out-Null
    }
}

# Do not leave a service child process locking Program Files while Inno is
# removing the installed application directory.
Get-Process -Name "AutocomBridgeService" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
    if (-not (Get-Process -Name "AutocomBridgeService" -ErrorAction SilentlyContinue)) {
        break
    }
    Start-Sleep -Milliseconds 250
}

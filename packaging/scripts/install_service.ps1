$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$ServiceName = "AutocomBridgeService"
$Nssm = Join-Path $InstallDir "tools\nssm.exe"
$BridgeExe = Join-Path $InstallDir "AutocomBridgeService\AutocomBridgeService.exe"
$WorkDir = Join-Path $InstallDir "AutocomBridgeService"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    & $Nssm stop $ServiceName
    & $Nssm remove $ServiceName confirm
}

& $Nssm install $ServiceName $BridgeExe
& $Nssm set $ServiceName AppDirectory $WorkDir
& $Nssm set $ServiceName DisplayName "Autocom Bridge Service"
& $Nssm set $ServiceName Description "Local Autocom Bridge API and Admin UI service"
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppStdout "C:\ProgramData\AutocomBridge\logs\bridge-service.out.log"
& $Nssm set $ServiceName AppStderr "C:\ProgramData\AutocomBridge\logs\bridge-service.err.log"
& $Nssm set $ServiceName AppRestartDelay 5000

& $Nssm start $ServiceName
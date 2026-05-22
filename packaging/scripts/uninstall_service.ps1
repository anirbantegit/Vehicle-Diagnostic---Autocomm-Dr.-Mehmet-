$ErrorActionPreference = "SilentlyContinue"

$InstallDir = Split-Path -Parent $PSScriptRoot
$ServiceName = "AutocomBridgeService"
$Nssm = Join-Path $InstallDir "tools\nssm.exe"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    & $Nssm stop $ServiceName
    Start-Sleep -Seconds 2
    & $Nssm remove $ServiceName confirm
}
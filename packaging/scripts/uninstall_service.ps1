$ErrorActionPreference = "SilentlyContinue"

$InstallDir = Split-Path -Parent $PSScriptRoot
$ServiceNames = @("DiagnosticEngineConsoleService", "AutocomBridgeService")
$Nssm = Join-Path $InstallDir "tools\nssm.exe"

foreach ($ServiceName in $ServiceNames) {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        & $Nssm stop $ServiceName
        Start-Sleep -Seconds 2
        & $Nssm remove $ServiceName confirm
    }
}
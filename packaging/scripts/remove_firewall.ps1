$ErrorActionPreference = "SilentlyContinue"
$InstallDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "network_permissions.ps1")

Uninstall-MobileNetworkPermissions -InstallDir $InstallDir

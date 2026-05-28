[CmdletBinding()]
param(
    [switch]$AllowPublicProfile
)

$ErrorActionPreference = "Stop"
$InstallDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "network_permissions.ps1")

Install-MobileNetworkPermissions -InstallDir $InstallDir -AllowPublicProfile:$AllowPublicProfile

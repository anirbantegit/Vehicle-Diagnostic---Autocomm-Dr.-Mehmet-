$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $InstallDir ".env"
$FallbackDataDir = Join-Path $env:ProgramData "AutocomBridge"

function Get-EnvValue {
    param([string]$Name, [string]$Default = "")
    if (-not (Test-Path -LiteralPath $EnvPath)) {
        return $Default
    }
    $Pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$"
    $Match = Select-String -LiteralPath $EnvPath -Pattern $Pattern | Select-Object -First 1
    if (-not $Match) {
        return $Default
    }
    return $Match.Matches[0].Groups[1].Value.Trim().Trim("'").Trim('"')
}

$DataDir = Get-EnvValue "AUTOCOM_BRIDGE_DATA_DIR" $FallbackDataDir
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    $DataDir = $FallbackDataDir
}
$DataDir = [Environment]::ExpandEnvironmentVariables($DataDir)
$LogDir = Join-Path $DataDir "logs"
$OpenAdminLog = Join-Path $LogDir "open-admin.log"
$BridgePort = Get-EnvValue "BRIDGE_PORT" "8090"
$AdminUri = "http://localhost:$BridgePort/admin"
$IdentityUri = "http://127.0.0.1:$BridgePort/bridge/public/identity"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-OpenAdminLog {
    param([string]$Level, [string]$Message)
    Add-Content -LiteralPath $OpenAdminLog -Value "$(Get-Date -Format o) [$Level] $Message"
}

Write-OpenAdminLog "INFO" "Opening $AdminUri using installed environment $EnvPath data_dir=$DataDir"
Start-Process $AdminUri

try {
    Invoke-RestMethod -Method Get -Uri $IdentityUri -TimeoutSec 2 | Out-Null
    Write-OpenAdminLog "INFO" "Bridge is reachable at $IdentityUri"
}
catch {
    Write-OpenAdminLog "ERROR" "Bridge is not reachable at $IdentityUri. Error=$($_.Exception.Message). Check service-install.log and bridge-service.err.log in $LogDir."
}

$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $InstallDir ".env"
$ProdEnvTemplatePath = Join-Path $InstallDir ".env.prod"
$FallbackEnvTemplatePath = Join-Path $InstallDir ".env.fallback"
$FallbackDataDir = Join-Path $env:ProgramData "AutocomBridge"

function Get-EnvValueFromFile {
    param([string]$Path, [string]$Name, [string]$Default = "")
    if (-not (Test-Path -LiteralPath $Path)) {
        return $Default
    }
    $Pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$"
    $Match = Select-String -LiteralPath $Path -Pattern $Pattern | Select-Object -First 1
    if (-not $Match) {
        return $Default
    }
    return $Match.Matches[0].Groups[1].Value.Trim().Trim("'").Trim('"')
}

if (Test-Path -LiteralPath $ProdEnvTemplatePath) {
    $SelectedEnvPath = $ProdEnvTemplatePath
    $SelectedSourceName = ".env.prod"
}
elseif (Test-Path -LiteralPath $FallbackEnvTemplatePath) {
    $SelectedEnvPath = $FallbackEnvTemplatePath
    $SelectedSourceName = ".env"
}
elseif (Test-Path -LiteralPath $EnvPath) {
    $SelectedEnvPath = $EnvPath
    $SelectedSourceName = ".env (existing install fallback)"
}
else {
    throw "Installed configuration is missing. Expected $ProdEnvTemplatePath first, then $FallbackEnvTemplatePath, then existing $EnvPath."
}

$DataDir = Get-EnvValueFromFile -Path $SelectedEnvPath -Name "AUTOCOM_BRIDGE_DATA_DIR" -Default $FallbackDataDir
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    $DataDir = $FallbackDataDir
}
$DataDir = [Environment]::ExpandEnvironmentVariables($DataDir)
$LogDir = Join-Path $DataDir "logs"
$ConfigLog = Join-Path $LogDir "config-install.log"
$ConfigBackupDir = Join-Path $DataDir "config-backups"
$WritableRuntimeDirs = @(
    (Join-Path $DataDir "agent-logs"),
    (Join-Path $DataDir "outputs"),
    (Join-Path $DataDir "screenshots")
)

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-ConfigLog {
    param([string]$Level, [string]$Message)
    Add-Content -LiteralPath $ConfigLog -Value "$(Get-Date -Format o) [$Level] $Message"
}

function Grant-UsersModify {
    param([string]$Path)
    & icacls.exe $Path /grant '*S-1-5-32-545:(OI)(CI)(M)' /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to grant Users modify access to interactive-runtime directory: $Path"
    }
}

try {
    Write-ConfigLog "INFO" "Selected installer environment source=$SelectedSourceName template=$SelectedEnvPath data_dir=$DataDir"

    if ($SelectedEnvPath -ne $EnvPath) {
        if (Test-Path -LiteralPath $EnvPath) {
            New-Item -ItemType Directory -Path $ConfigBackupDir -Force | Out-Null
            $BackupPath = Join-Path $ConfigBackupDir (".env.before-install-{0}.bak" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
            Copy-Item -LiteralPath $EnvPath -Destination $BackupPath -Force
            Write-ConfigLog "INFO" "Existing installed .env backed up before applying preferred installer environment: $BackupPath"
        }
        Copy-Item -LiteralPath $SelectedEnvPath -Destination $EnvPath -Force
        Write-ConfigLog "INFO" "Activated installer environment source=$SelectedSourceName by writing runtime config: $EnvPath"
    }
    else {
        Write-ConfigLog "WARN" "No shipped .env.prod or .env fallback template was found; retaining existing runtime .env: $EnvPath"
    }

    New-Item -ItemType Directory -Path (Join-Path $DataDir "secrets") -Force | Out-Null
    foreach ($Directory in $WritableRuntimeDirs) {
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
        Grant-UsersModify -Path $Directory
    }

    $AppEnvironment = Get-EnvValueFromFile -Path $EnvPath -Name "APP_ENV" -Default "development"
    $BridgeHost = Get-EnvValueFromFile -Path $EnvPath -Name "BRIDGE_HOST" -Default "0.0.0.0"
    $BridgePort = Get-EnvValueFromFile -Path $EnvPath -Name "BRIDGE_PORT" -Default "8090"
    $AgentHost = Get-EnvValueFromFile -Path $EnvPath -Name "AGENT_HOST" -Default "127.0.0.1"
    $AgentPort = Get-EnvValueFromFile -Path $EnvPath -Name "AGENT_PORT" -Default "8091"
    $EngineHost = Get-EnvValueFromFile -Path $EnvPath -Name "AUTOCOM_HOST" -Default "localhost"
    $EngineHttpPort = Get-EnvValueFromFile -Path $EnvPath -Name "AUTOCOM_HTTP_PORT" -Default "9000"
    $EngineSignalrPort = Get-EnvValueFromFile -Path $EnvPath -Name "AUTOCOM_SIGNALR_PORT" -Default "9001"

    Write-ConfigLog "INFO" "Resolved settings APP_ENV=$AppEnvironment DATA_DIR=$DataDir BRIDGE=http://${BridgeHost}:$BridgePort AGENT=http://${AgentHost}:$AgentPort ENGINE_API=http://${EngineHost}:$EngineHttpPort/api ENGINE_SIGNALR=http://${EngineHost}:$EngineSignalrPort/signalr"
    if ($AppEnvironment -ne "production") {
        Write-ConfigLog "WARN" "The selected installer environment is not production: APP_ENV=$AppEnvironment source=$SelectedSourceName"
    }
}
catch {
    Write-ConfigLog "ERROR" ("Environment preparation failed: " + ($_ | Out-String).Trim())
    throw
}

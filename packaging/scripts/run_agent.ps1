$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$AgentExe = Join-Path $InstallDir "AutocomDesktopAgent\AutocomDesktopAgent.exe"
$EnvFile = Join-Path $InstallDir ".env"
$FallbackDataDir = Join-Path $env:ProgramData "AutocomBridge"

function Get-EnvValue {
    param([string]$Name, [string]$Default = "")
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        return $Default
    }
    $Pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$"
    $Match = Select-String -LiteralPath $EnvFile -Pattern $Pattern | Select-Object -First 1
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
$AgentLogDir = Join-Path $DataDir "agent-logs"
$AgentOutputLog = Join-Path $AgentLogDir "desktop-agent.out.log"
$AgentErrorLog = Join-Path $AgentLogDir "desktop-agent.err.log"
$AgentLaunchLog = Join-Path $AgentLogDir "desktop-agent.launch.log"

function Write-AgentLaunchLog {
    param([string]$Level, [string]$Message)
    $Line = "$(Get-Date -Format o) [$Level] $Message"
    Add-Content -LiteralPath $AgentLaunchLog -Value $Line
    if ($Level -eq "ERROR") {
        Add-Content -LiteralPath $AgentErrorLog -Value $Line
    }
    else {
        Add-Content -LiteralPath $AgentOutputLog -Value $Line
    }
}

try {
    New-Item -ItemType Directory -Path $AgentLogDir -Force | Out-Null

    $SessionId = (Get-Process -Id $PID).SessionId
    $RunAsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    Write-AgentLaunchLog "INFO" "Launch requested. WrapperPid=$PID SessionId=$SessionId User=$RunAsUser InstallDir=$InstallDir DataDir=$DataDir"

    foreach ($RequiredFile in @($AgentExe, $EnvFile)) {
        if (-not (Test-Path -LiteralPath $RequiredFile)) {
            throw "Diagnostic Engine Console Desktop Agent setup file is missing: $RequiredFile"
        }
    }

    $AppEnvironment = Get-EnvValue "APP_ENV" "development"
    $AgentHost = Get-EnvValue "AGENT_HOST" "127.0.0.1"
    $AgentPort = Get-EnvValue "AGENT_PORT" "8091"
    $EngineHost = Get-EnvValue "AUTOCOM_HOST" "localhost"
    $EngineHttpPort = Get-EnvValue "AUTOCOM_HTTP_PORT" "9000"
    $EngineSignalrPort = Get-EnvValue "AUTOCOM_SIGNALR_PORT" "9001"
    Write-AgentLaunchLog "INFO" "Environment file=$EnvFile APP_ENV=$AppEnvironment DATA_DIR=$DataDir AGENT=http://${AgentHost}:$AgentPort ENGINE_API=http://${EngineHost}:$EngineHttpPort/api ENGINE_SIGNALR=http://${EngineHost}:$EngineSignalrPort/signalr"

    $env:AUTOCOM_BRIDGE_ENV_FILE = $EnvFile
    Write-AgentLaunchLog "INFO" "Starting Diagnostic Engine Console Desktop Agent executable: $AgentExe"

    # Uvicorn writes normal lifecycle INFO messages to stderr. Windows PowerShell
    # surfaces native stderr as NativeCommandError; with ErrorActionPreference=Stop
    # that healthy startup output must not terminate this long-running wrapper.
    $SavedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $AgentExe 1>> $AgentOutputLog 2>> $AgentErrorLog
        $ExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $SavedErrorActionPreference
    }

    if ($ExitCode -eq 0) {
        Write-AgentLaunchLog "INFO" "Desktop Agent exited with code $ExitCode."
    }
    else {
        Write-AgentLaunchLog "ERROR" "Desktop Agent exited with code $ExitCode. Inspect the stderr traceback immediately above in $AgentErrorLog."
    }
    exit $ExitCode
}
catch {
    $Failure = ($_ | Format-List * -Force | Out-String).Trim()
    try {
        New-Item -ItemType Directory -Path $AgentLogDir -Force | Out-Null
        Write-AgentLaunchLog "ERROR" "Desktop Agent wrapper launch failed:`r`n$Failure"
    }
    catch {
        # ProgramData itself could not be written; there is no safe secondary persistent location.
    }
    exit 1
}

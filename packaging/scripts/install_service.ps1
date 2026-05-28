$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$ServiceName = "DiagnosticEngineConsoleService"
$LegacyServiceName = "AutocomBridgeService"
$Nssm = Join-Path $InstallDir "tools\nssm.exe"
$BridgeExe = Join-Path $InstallDir "AutocomBridgeService\AutocomBridgeService.exe"
$WorkDir = Join-Path $InstallDir "AutocomBridgeService"
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
$LogDir = Join-Path $DataDir "logs"
$ServiceInstallLog = Join-Path $LogDir "service-install.log"
$ServiceOutputLog = Join-Path $LogDir "bridge-service.out.log"
$ServiceErrorLog = Join-Path $LogDir "bridge-service.err.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-ServiceInstallLog {
    param([string]$Level, [string]$Message)
    Add-Content -LiteralPath $ServiceInstallLog -Value "$(Get-Date -Format o) [$Level] $Message"
}

function Invoke-NssmCommand {
    param([string[]]$Arguments)
    Write-ServiceInstallLog "INFO" ("nssm " + ($Arguments -join " "))
    $SavedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $Nssm @Arguments *>> $ServiceInstallLog
        $ExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $SavedErrorActionPreference
    }
    if ($ExitCode -ne 0) {
        throw "NSSM command failed with exit code ${ExitCode}: nssm $($Arguments -join ' ')"
    }
}

try {
    Write-ServiceInstallLog "INFO" "Installing Diagnostic Engine Console service. InstallDir=$InstallDir BridgeExe=$BridgeExe EnvFile=$EnvFile DataDir=$DataDir"

    foreach ($RequiredFile in @($Nssm, $BridgeExe, $EnvFile)) {
        if (-not (Test-Path -LiteralPath $RequiredFile)) {
            throw "Bridge service setup file is missing: $RequiredFile"
        }
    }

    foreach ($ExistingServiceName in (@($LegacyServiceName, $ServiceName) | Select-Object -Unique)) {
        $ExistingService = Get-Service -Name $ExistingServiceName -ErrorAction SilentlyContinue
        if ($ExistingService) {
            Write-ServiceInstallLog "INFO" "Removing existing service registration: $ExistingServiceName CurrentStatus=$($ExistingService.Status)"
            if ($ExistingService.Status -ne "Stopped") {
                Invoke-NssmCommand -Arguments @("stop", $ExistingServiceName)
            }
            Invoke-NssmCommand -Arguments @("remove", $ExistingServiceName, "confirm")
        }
    }

    Invoke-NssmCommand -Arguments @("install", $ServiceName, $BridgeExe)
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "AppDirectory", $WorkDir)
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "AppEnvironmentExtra", "AUTOCOM_BRIDGE_ENV_FILE=$EnvFile")
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "DisplayName", "Diagnostic Engine Console")
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "Description", "Diagnostic Engine Console local API and Admin UI service")
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "AppStdout", $ServiceOutputLog)
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "AppStderr", $ServiceErrorLog)
    Invoke-NssmCommand -Arguments @("set", $ServiceName, "AppRestartDelay", "5000")
    Invoke-NssmCommand -Arguments @("start", $ServiceName)

    $BridgePort = Get-EnvValue "BRIDGE_PORT" "8090"
    $BridgePublicScheme = Get-EnvValue "BRIDGE_PUBLIC_SCHEME" "http"
    $BridgeHealthUri = "${BridgePublicScheme}://localhost:$BridgePort/bridge/public/identity"
    $Ready = $false
    $LastProbeFailure = "No health response received."
    for ($Attempt = 1; $Attempt -le 12; $Attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            Invoke-RestMethod -Method Get -Uri $BridgeHealthUri -TimeoutSec 1 | Out-Null
            $Ready = $true
            Write-ServiceInstallLog "INFO" "Bridge health check succeeded on attempt ${Attempt}: $BridgeHealthUri"
            break
        }
        catch {
            $LastProbeFailure = $_.Exception.Message
        }
    }

    $Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $Status = if ($Service) { $Service.Status } else { "not-found" }
    if (-not $Ready) {
        $StderrTail = ""
        if (Test-Path -LiteralPath $ServiceErrorLog) {
            $StderrTail = (Get-Content -LiteralPath $ServiceErrorLog -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        }
        if ($StderrTail) {
            Write-ServiceInstallLog "ERROR" "bridge-service.err.log tail:`r`n$StderrTail"
        }
        throw "Bridge service did not become reachable at $BridgeHealthUri. Service status=$Status. Last health probe failure=$LastProbeFailure. Check $ServiceErrorLog."
    }

    Write-ServiceInstallLog "INFO" "Service is reachable. CurrentStatus=$Status Runtime logs: $ServiceOutputLog ; $ServiceErrorLog"
}
catch {
    Write-ServiceInstallLog "ERROR" ("Service installation failed: " + ($_ | Out-String).Trim())
    throw
}

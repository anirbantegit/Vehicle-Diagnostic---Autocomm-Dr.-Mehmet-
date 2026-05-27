$ErrorActionPreference = "Stop"

$TaskName = "DiagnosticEngineConsoleDesktopAgent"
$LegacyTaskName = "AutocomDesktopAgent"
$InstallDir = Split-Path -Parent $PSScriptRoot
$AgentExe = Join-Path $InstallDir "AutocomDesktopAgent\AutocomDesktopAgent.exe"
$EnvFile = Join-Path $InstallDir ".env"
$RunnerScript = Join-Path $PSScriptRoot "run_agent.ps1"
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
$AgentErrorLog = Join-Path $AgentLogDir "desktop-agent.err.log"
$TaskInstallLog = Join-Path $AgentLogDir "desktop-agent-task-install.log"

New-Item -ItemType Directory -Path $AgentLogDir -Force | Out-Null

function Write-TaskInstallLog {
    param([string]$Level, [string]$Message)
    Add-Content -LiteralPath $TaskInstallLog -Value "$(Get-Date -Format o) [$Level] $Message"
}

try {
    Write-TaskInstallLog "INFO" "Registering scheduled task $TaskName. InstallDir=$InstallDir AgentExe=$AgentExe EnvFile=$EnvFile Runner=$RunnerScript DataDir=$DataDir"

    foreach ($RequiredFile in @($AgentExe, $EnvFile, $RunnerScript)) {
        if (-not (Test-Path -LiteralPath $RequiredFile)) {
            throw "Desktop Agent setup file is missing: $RequiredFile"
        }
    }

    $AgentPort = [int](Get-EnvValue "AGENT_PORT" "8091")
    $AgentHealthUri = "http://127.0.0.1:$AgentPort/agent/status"
    Write-TaskInstallLog "INFO" "Resolved Desktop Agent health URI: $AgentHealthUri"

    $InstallerSessionId = (Get-Process -Id $PID).SessionId
    $ExplorerProcess = Get-Process -Name explorer -IncludeUserName -ErrorAction SilentlyContinue |
        Where-Object { $_.SessionId -eq $InstallerSessionId -and -not [string]::IsNullOrWhiteSpace($_.UserName) } |
        Select-Object -First 1
    $InteractiveUser = if ($ExplorerProcess) {
        $ExplorerProcess.UserName
    }
    else {
        (Get-CimInstance -ClassName Win32_ComputerSystem).UserName
    }

    if ([string]::IsNullOrWhiteSpace($InteractiveUser)) {
        throw "No signed-in interactive Windows user was detected. Install while logged in to the desktop that will run diagnostics."
    }

    Write-Host "Registering Diagnostic Engine Console Desktop Agent for interactive user: $InteractiveUser"
    Write-TaskInstallLog "INFO" "Interactive user=$InteractiveUser installer_session_id=$InstallerSessionId"

    foreach ($ExistingTaskName in (@($LegacyTaskName, $TaskName) | Select-Object -Unique)) {
        Stop-ScheduledTask -TaskName $ExistingTaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $ExistingTaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-TaskInstallLog "INFO" "Removed previous scheduled task if present: $ExistingTaskName"
    }
    Get-Process -Name "AutocomDesktopAgent" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    $ExistingListener = Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue
    if ($ExistingListener) {
        $OwningPids = ($ExistingListener | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        throw "Desktop Agent port $AgentPort is already in use by PID(s) $OwningPids. Stop the existing process and run setup again."
    }

    $PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $ActionArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerScript`""
    $Action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $ActionArgs -WorkingDirectory $InstallDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $InteractiveUser
    $Principal = New-ScheduledTaskPrincipal -UserId $InteractiveUser -LogonType Interactive -RunLevel Limited
    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Principal $Principal `
        -Settings $Settings `
        -Description "Starts Diagnostic Engine Console desktop agent in the signed-in desktop session for visible UI automation" `
        -Force | Out-Null
    Write-TaskInstallLog "INFO" "Scheduled task registered; action=$PowerShellExe $ActionArgs"

    Start-ScheduledTask -TaskName $TaskName
    Write-TaskInstallLog "INFO" "Scheduled task start requested."

    $Ready = $false
    $LastProbeFailure = "No health response received."
    for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $Status = Invoke-RestMethod -Method Get -Uri $AgentHealthUri -TimeoutSec 1
            if ($Status.agent -eq "running") {
                $Ready = $true
                Write-TaskInstallLog "INFO" "Desktop Agent health check succeeded on attempt $Attempt."
                break
            }
            $LastProbeFailure = "Unexpected agent status response: $($Status | ConvertTo-Json -Compress)"
        }
        catch {
            $LastProbeFailure = $_.Exception.Message
        }
    }

    if (-not $Ready) {
        $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        $State = if ($Task) { $Task.State } else { "not-found" }
        $LastResult = if ($TaskInfo) { $TaskInfo.LastTaskResult } else { "unknown" }
        throw "Desktop Agent did not start on $AgentHealthUri. Scheduled task State=$State LastTaskResult=$LastResult. Last health probe failure=$LastProbeFailure. Check $AgentErrorLog."
    }

    Write-Host "Diagnostic Engine Console Desktop Agent is reachable at $AgentHealthUri."
}
catch {
    $Failure = ($_ | Format-List * -Force | Out-String).Trim()
    Write-TaskInstallLog "ERROR" "Desktop Agent scheduled-task setup failed:`r`n$Failure"
    if (Test-Path -LiteralPath $AgentErrorLog) {
        $StderrTail = (Get-Content -LiteralPath $AgentErrorLog -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        if ($StderrTail) {
            Write-TaskInstallLog "ERROR" "desktop-agent.err.log tail:`r`n$StderrTail"
        }
    }
    throw
}

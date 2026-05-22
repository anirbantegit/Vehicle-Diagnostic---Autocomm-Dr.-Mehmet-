$ErrorActionPreference = "Stop"

$TaskName = "AutocomDesktopAgent"
$InstallDir = Split-Path -Parent $PSScriptRoot
$AgentExe = Join-Path $InstallDir "AutocomDesktopAgent\AutocomDesktopAgent.exe"
$WorkDir = Join-Path $InstallDir "AutocomDesktopAgent"

$Action = New-ScheduledTaskAction -Execute $AgentExe -WorkingDirectory $WorkDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Starts Autocom Desktop Agent after user login for visible desktop automation" `
    -Force

Start-ScheduledTask -TaskName $TaskName
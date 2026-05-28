$ErrorActionPreference = "SilentlyContinue"

$InstallDir = Split-Path -Parent $PSScriptRoot
$TaskNames = @("DiagnosticEngineConsoleDesktopAgent", "AutocomDesktopAgent")

foreach ($TaskName in $TaskNames) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

# Stop both the GUI-subsystem agent and an older console-agent installation.
Get-Process -Name "AutocomDesktopAgent" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

# A stopped task can leave its PowerShell wrapper alive briefly. Kill only the
# wrapper belonging to this installation, never unrelated PowerShell sessions.
$RunAgentScript = (Join-Path $PSScriptRoot "run_agent.ps1").ToLowerInvariant()
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -match '^powershell(\.exe)?$' -and
        $_.CommandLine -and
        $_.CommandLine.ToLowerInvariant().Contains($RunAgentScript)
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
    if (-not (Get-Process -Name "AutocomDesktopAgent" -ErrorAction SilentlyContinue)) {
        break
    }
    Start-Sleep -Milliseconds 250
    Get-Process -Name "AutocomDesktopAgent" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

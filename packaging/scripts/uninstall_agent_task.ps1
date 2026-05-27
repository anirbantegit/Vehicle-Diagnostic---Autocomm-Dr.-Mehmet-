$ErrorActionPreference = "SilentlyContinue"

$TaskNames = @("DiagnosticEngineConsoleDesktopAgent", "AutocomDesktopAgent")

foreach ($TaskName in $TaskNames) {
    Stop-ScheduledTask -TaskName $TaskName
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Get-Process AutocomDesktopAgent -ErrorAction SilentlyContinue | Stop-Process -Force
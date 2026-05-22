$ErrorActionPreference = "SilentlyContinue"

$TaskName = "AutocomDesktopAgent"

Get-Process AutocomDesktopAgent -ErrorAction SilentlyContinue | Stop-Process -Force
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
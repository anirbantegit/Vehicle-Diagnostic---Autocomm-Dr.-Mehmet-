$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
Set-Location $Root

function Assert-LastCommandOk {
    param([string]$Step)

    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

function Stop-AutocomBridgeProcesses {
    Write-Host "Stopping running Autocom Bridge processes..."

    $processNames = @(
        "AutocomBridgeService",
        "AutocomDesktopAgent"
    )

    foreach ($name in $processNames) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "Stopping process $($_.ProcessName) [$($_.Id)]"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }

    $projectPath = $Root.Path.ToLowerInvariant()

    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -match "python" -and
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($projectPath) -and
            (
                $_.CommandLine.ToLowerInvariant().Contains("scripts\run_bridge.py") -or
                $_.CommandLine.ToLowerInvariant().Contains("scripts\run_desktop_agent.py")
            )
        } |
        ForEach-Object {
            Write-Host "Stopping source-mode runner $($_.Name) [$($_.ProcessId)]"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Start-Sleep -Seconds 2
}

function Assert-PortsFree {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

        if ($connections) {
            foreach ($connection in $connections) {
                $pidValue = $connection.OwningProcess
                $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue

                $processInfo = "unknown process"
                if ($process) {
                    $processInfo = "$($process.ExecutablePath) $($process.CommandLine)"
                }

                throw "Port ${port} is still in use by PID ${pidValue}: $processInfo"
            }
        }
    }
}

function Remove-BuildFolders {
    Write-Host "Cleaning old builds..."

    Remove-Item -Recurse -Force "$Root\build" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$Root\dist" -ErrorAction SilentlyContinue
    Remove-Item -Force "$Root\AutocomBridgeService.spec" -ErrorAction SilentlyContinue
    Remove-Item -Force "$Root\AutocomDesktopAgent.spec" -ErrorAction SilentlyContinue

    if (Test-Path "$Root\build") {
        throw "Failed to remove build directory. Close Explorer/IDE/terminal locks and retry."
    }

    if (Test-Path "$Root\dist") {
        throw "Failed to remove dist directory. Close Explorer/IDE/terminal locks and retry."
    }
}

Stop-AutocomBridgeProcesses
Assert-PortsFree @(8090, 8091)
Remove-BuildFolders

Write-Host "Checking Python syntax..."
python -m compileall app scripts
Assert-LastCommandOk "Python compileall"

Write-Host "Checking Python dependencies..."
python -m pip check
Assert-LastCommandOk "pip check"

Write-Host "Building React Admin..."
Set-Location "$Root\admin-ui"

pnpm install
Assert-LastCommandOk "pnpm install"

pnpm build
Assert-LastCommandOk "pnpm build"

Set-Location $Root

Write-Host "Building Bridge executable..."
pyinstaller `
  --noconfirm `
  --clean `
  --onedir `
  --name AutocomBridgeService `
  --paths "$Root" `
  --collect-submodules app `
  --add-data "app\web_admin\dist;app\web_admin\dist" `
  scripts\run_bridge.py
Assert-LastCommandOk "Bridge PyInstaller build"

Write-Host "Building Desktop Agent executable..."
pyinstaller `
  --noconfirm `
  --clean `
  --onedir `
  --name AutocomDesktopAgent `
  --paths "$Root" `
  --collect-submodules app `
  scripts\run_desktop_agent.py
Assert-LastCommandOk "Desktop Agent PyInstaller build"

Write-Host "Copying packaging scripts..."
New-Item -ItemType Directory -Force "$Root\dist\installer_payload\scripts" | Out-Null
New-Item -ItemType Directory -Force "$Root\dist\installer_payload\tools" | Out-Null

Copy-Item "$Root\packaging\scripts\*.ps1" "$Root\dist\installer_payload\scripts\" -Force
Copy-Item "$Root\packaging\tools\nssm.exe" "$Root\dist\installer_payload\tools\" -Force

Write-Host "Build complete."
Write-Host "Next: compile packaging\installer\AutocomBridge.iss with Inno Setup."
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
    Write-Host "Stopping running Diagnostic Engine Console processes..."

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

Write-Host "Building React Mobile Portal..."
pnpm run build:mobile
Assert-LastCommandOk "pnpm run build:mobile"

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
  --add-data "app\web_mobile\dist;app\web_mobile\dist" `
  scripts\run_bridge.py
Assert-LastCommandOk "Bridge PyInstaller build"

Write-Host "Building Desktop Agent executable..."
pyinstaller `
  --noconfirm `
  --clean `
  --onedir `
  --noconsole `
  --name AutocomDesktopAgent `
  --paths "$Root" `
  --collect-submodules app `
  scripts\run_desktop_agent.py
Assert-LastCommandOk "Desktop Agent PyInstaller build"

Write-Host "Copying packaging scripts and selected environment template..."
$ProdEnvTemplate = Join-Path $Root ".env.prod"
$FallbackEnvTemplate = Join-Path $Root ".env"
if (Test-Path -LiteralPath $ProdEnvTemplate) {
    $SelectedEnvTemplate = $ProdEnvTemplate
    $SelectedPayloadName = ".env.prod"
    $SelectedSourceName = ".env.prod"
}
elseif (Test-Path -LiteralPath $FallbackEnvTemplate) {
    $SelectedEnvTemplate = $FallbackEnvTemplate
    $SelectedPayloadName = ".env.fallback"
    $SelectedSourceName = ".env"
}
else {
    throw "No installer environment source found. Add .env.prod (preferred) or .env at the project root."
}

$PayloadScriptsDir = Join-Path $Root "dist\installer_payload\scripts"
$PayloadToolsDir = Join-Path $Root "dist\installer_payload\tools"
$PayloadConfigDir = Join-Path $Root "dist\installer_payload\config"
New-Item -ItemType Directory -Force $PayloadScriptsDir | Out-Null
New-Item -ItemType Directory -Force $PayloadToolsDir | Out-Null
New-Item -ItemType Directory -Force $PayloadConfigDir | Out-Null

Remove-Item -LiteralPath (Join-Path $PayloadConfigDir ".env.prod") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $PayloadConfigDir ".env.fallback") -Force -ErrorAction SilentlyContinue
Copy-Item "$Root\packaging\scripts\*.ps1" $PayloadScriptsDir -Force
Copy-Item "$Root\packaging\tools\nssm.exe" $PayloadToolsDir -Force
Copy-Item -LiteralPath $SelectedEnvTemplate -Destination (Join-Path $PayloadConfigDir $SelectedPayloadName) -Force
Write-Host "Installer environment selected: $SelectedSourceName ($SelectedEnvTemplate)"

Write-Host "Build complete."
Write-Host "Next: compile packaging\installer\AutocomBridge.iss with Inno Setup."
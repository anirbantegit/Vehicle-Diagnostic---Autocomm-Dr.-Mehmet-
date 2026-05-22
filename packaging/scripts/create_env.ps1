$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $InstallDir ".env"

if (Test-Path $EnvPath) {
    Write-Host ".env already exists. Keeping existing config."
    exit 0
}

$EnvText = @"
APP_ENV=production

BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8090
BRIDGE_PUBLIC_HOST=

AGENT_HOST=127.0.0.1
AGENT_PORT=8091

ADMIN_SESSION_TTL_SECONDS=43200
AUTOCOM_BRIDGE_DATA_DIR=C:/ProgramData/AutocomBridge

AUTOCOM_HOST=localhost
AUTOCOM_HTTP_PORT=9000
AUTOCOM_SIGNALR_PORT=9001

WINDOW_TITLE_RE='^Autocom (Cars|Trucks) CDP\+.*$'

GENERIC_OBD_CLICK_X=52
GENERIC_OBD_CLICK_Y=280

DEFAULT_TIMEOUT=10
DEFAULT_WAIT_AFTER_CLICK=2

DEBUG_SCREENSHOTS=false
"@

Set-Content -Path $EnvPath -Value $EnvText -Encoding UTF8
from app.settings import settings

ROOT_DIR = settings.root_dir

WINDOW_TITLE_RE = settings.window_title_re

DEFAULT_TIMEOUT = settings.default_timeout
DEFAULT_WAIT_AFTER_CLICK = settings.default_wait_after_click

DEBUG_SCREENSHOTS = settings.debug_screenshots

STORAGE_DIR = settings.storage_dir
OUTPUT_DIR = settings.output_dir
SCREENSHOT_DIR = settings.screenshot_dir
LOG_DIR = settings.log_dir

AUTOCOM_SERVER_BASE = settings.autocom_server_base
AUTOCOM_API_BASE = settings.autocom_api_base
AUTOCOM_SIGNALR_BASE = settings.autocom_signalr_base

BRIDGE_HOST = settings.bridge_host
BRIDGE_PORT = settings.bridge_port
AGENT_HOST = settings.agent_host
AGENT_PORT = settings.agent_port

GENERIC_OBD_CLICK_X = settings.generic_obd_click_x
GENERIC_OBD_CLICK_Y = settings.generic_obd_click_y

HARDWARE_SETUP_KEYWORDS = [
    "Hardware setup",
    "VCI connection",
    "No device selected",
    "Bluetooth [direct]",
]

DIAGNOSTIC_READY_KEYWORDS = [
    "OBD Functions",
    "RTD Functions",
    "Real Time Data",
    "Functions",
]

AUTOCOM_HOST = settings.autocom_host
AUTOCOM_HTTP_PORT = settings.autocom_http_port
AUTOCOM_SIGNALR_PORT = settings.autocom_signalr_port
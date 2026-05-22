import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _runtime_root_dir() -> Path:
    """
    Source mode:
      project root

    PyInstaller onedir mode:
      dist/\u003cAppName>/_internal

    This root is used for bundled resources such as app/web_admin/dist.
    """
    if _is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))

    return Path(__file__).resolve().parents[1]


def _env_search_dirs(root_dir: Path) -> list[Path]:
    """
    Source mode:
      project root

    PyInstaller test mode:
      dist/\u003cAppName>/.env
      dist/.env

    Installed mode:
      C:/Program Files/AutocomBridge/\u003cAppName>/.env
      C:/Program Files/AutocomBridge/.env
    """
    if _is_frozen():
        exe_dir = Path(sys.executable).resolve().parent
        return [
            exe_dir,
            exe_dir.parent,
            Path.cwd(),
            root_dir,
        ]

    return [
        root_dir,
        Path.cwd(),
    ]


def _load_runtime_env(root_dir: Path) -> Path | None:
    env_file = os.getenv("AUTOCOM_BRIDGE_ENV_FILE", ".env")
    env_path = Path(env_file)

    if env_path.is_absolute():
        if env_path.exists():
            load_dotenv(env_path, override=True)
            return env_path
        return None

    for directory in _env_search_dirs(root_dir):
        candidate = directory / env_path
        if candidate.exists():
            load_dotenv(candidate, override=True)
            return candidate

    return None


ROOT_DIR = _runtime_root_dir()
LOADED_ENV_FILE = _load_runtime_env(ROOT_DIR)


def env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    root_dir: Path = ROOT_DIR
    loaded_env_file: Path | None = LOADED_ENV_FILE
    app_env: str = env_str("APP_ENV", "development").lower()

    bridge_host: str = env_str("BRIDGE_HOST", "0.0.0.0")
    bridge_port: int = env_int("BRIDGE_PORT", 8090)
    bridge_public_host: str = env_str("BRIDGE_PUBLIC_HOST", "")

    agent_host: str = env_str("AGENT_HOST", "127.0.0.1")
    agent_port: int = env_int("AGENT_PORT", 8091)

    api_token: str = env_str("API_TOKEN", "change-me-dev-token")

    autocom_host: str = env_str("AUTOCOM_HOST", "localhost")
    autocom_http_port: int = env_int("AUTOCOM_HTTP_PORT", 9000)
    autocom_signalr_port: int = env_int(
        "AUTOCOM_SIGNALR_PORT",
        env_int("AUTOCOM_HTTP_PORT", 9000) + 1,
    )

    window_title_re: str = env_str(
        "WINDOW_TITLE_RE",
        r"^Autocom (Cars|Trucks) CDP\+.*$",
    )

    default_timeout: int = env_int("DEFAULT_TIMEOUT", 10)
    default_wait_after_click: int = env_int("DEFAULT_WAIT_AFTER_CLICK", 2)
    debug_screenshots: bool = env_bool("DEBUG_SCREENSHOTS", False)

    generic_obd_click_x: int = env_int("GENERIC_OBD_CLICK_X", 52)
    generic_obd_click_y: int = env_int("GENERIC_OBD_CLICK_Y", 280)

    @property
    def storage_dir(self) -> Path:
        return self.root_dir / "storage"

    @property
    def data_dir(self) -> Path:
        configured = os.getenv("AUTOCOM_BRIDGE_DATA_DIR")
        if configured:
            return Path(configured)

        program_data = os.getenv("PROGRAMDATA")
        if self.app_env == "production" and os.name == "nt" and program_data:
            return Path(program_data) / "AutocomBridge"

        return self.storage_dir

    @property
    def identity_file(self) -> Path:
        return self.data_dir / "identity.json"

    @property
    def clients_file(self) -> Path:
        return self.data_dir / "clients.json"

    @property
    def web_admin_dist_dir(self) -> Path:
        return self.root_dir / "app" / "web_admin" / "dist"

    @property
    def web_admin_index_file(self) -> Path:
        return self.web_admin_dist_dir / "index.html"

    @property
    def output_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def screenshot_dir(self) -> Path:
        return self.data_dir / "screenshots"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def autocom_server_base(self) -> str:
        return f"http://{self.autocom_host}:{self.autocom_http_port}"

    @property
    def autocom_api_base(self) -> str:
        return f"{self.autocom_server_base}/api"

    @property
    def autocom_signalr_base(self) -> str:
        return f"http://{self.autocom_host}:{self.autocom_signalr_port}/signalr"

    @property
    def agent_base_url(self) -> str:
        return f"http://{self.agent_host}:{self.agent_port}"


settings = Settings()

def validate_runtime_settings() -> None:
    if settings.app_env == "production":
        invalid_tokens = {
            "",
            "change-me-dev-token",
            "<installer-generated-random-token>",
        }

        if (settings.api_token or "").strip() in invalid_tokens:
            raise RuntimeError(
                "Production API_TOKEN must be generated by installer and must not use a placeholder."
            )

        if settings.agent_host not in {"127.0.0.1", "localhost", "::1"}:
            raise RuntimeError(
                "Desktop Agent must bind to localhost only in production."
            )


def ensure_runtime_dirs() -> None:
    if settings.app_env != "production":
        settings.storage_dir.mkdir(parents=True, exist_ok=True)

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    settings.screenshot_dir.mkdir(parents=True, exist_ok=True)
    settings.log_dir.mkdir(parents=True, exist_ok=True)
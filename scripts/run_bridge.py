import sys
from pathlib import Path

import uvicorn

ROOT_DIR = Path(__file__).resolve().parents[1]

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.bridge.main import app as bridge_app
from app.device.identity import get_bridge_base_url
from app.settings import settings, validate_runtime_settings


def main():
    validate_runtime_settings()
    admin_url = f"{settings.bridge_public_scheme}://localhost:{settings.bridge_port}/admin"
    mobile_url = f"{get_bridge_base_url()}/mobile"
    print(f"Loaded env file: {settings.loaded_env_file}")
    print(f"Admin Console on this PC: {admin_url}")
    print(f"Mobile Portal for a phone on the same Wi-Fi/LAN: {mobile_url}")
    if any(host in mobile_url for host in ("//127.0.0.1:", "//localhost:", "//[::1]:")):
        print("WARNING: The mobile URL is loopback-only. Set BRIDGE_PUBLIC_HOST to this PC's LAN IPv4 address.")
    ssl_options = {}
    if settings.bridge_tls_enabled:
        ssl_options = {
            "ssl_certfile": str(settings.bridge_tls_cert_path),
            "ssl_keyfile": str(settings.bridge_tls_key_path),
        }
        print("Live mobile QR camera mode enabled through HTTPS. The phone must trust this certificate.")
    else:
        print("Live mobile QR camera mode is disabled on HTTP. Configure trusted HTTPS for in-browser live scanning.")
    uvicorn.run(
        bridge_app,
        host=settings.bridge_host,
        port=settings.bridge_port,
        reload=False,
        **ssl_options,
    )


if __name__ == "__main__":
    main()
import sys
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.device.identity import get_bridge_base_url
from app.settings import settings


def main():
    admin_url = f"{settings.bridge_public_scheme}://localhost:{settings.bridge_port}/admin"
    mobile_url = f"{get_bridge_base_url()}/mobile"
    print(f"Opening Diagnostic Engine Console: {admin_url}")
    print(f"Mobile Portal for a phone on the same Wi-Fi/LAN: {mobile_url}")
    webbrowser.open(admin_url)


if __name__ == "__main__":
    main()
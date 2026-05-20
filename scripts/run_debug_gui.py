import sys
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.settings import settings


def main():
    url = f"http://127.0.0.1:{settings.bridge_port}/admin"
    print(f"Opening Autocom Bridge Admin: {url}")
    webbrowser.open(url)


if __name__ == "__main__":
    main()
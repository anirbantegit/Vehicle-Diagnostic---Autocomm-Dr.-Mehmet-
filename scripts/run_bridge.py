import sys
from pathlib import Path

import uvicorn

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.settings import settings


def main():
    uvicorn.run("app.bridge.main:app", host=settings.bridge_host, port=settings.bridge_port, reload=False)


if __name__ == "__main__":
    main()
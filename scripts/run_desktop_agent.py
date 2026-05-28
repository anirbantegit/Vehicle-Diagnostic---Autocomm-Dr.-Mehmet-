import os
import sys
from pathlib import Path

import uvicorn

ROOT_DIR = Path(__file__).resolve().parents[1]

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.desktop_agent.main import app as desktop_agent_app
from app.settings import settings, validate_runtime_settings


def main():
    # PyInstaller --noconsole builds have no terminal-backed stdio streams.
    # Keep third-party server logging safe while the Desktop Agent runs invisibly.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")

    validate_runtime_settings()
    uvicorn.run(
        desktop_agent_app,
        host=settings.agent_host,
        port=settings.agent_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
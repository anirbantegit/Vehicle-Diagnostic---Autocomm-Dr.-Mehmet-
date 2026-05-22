import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.automation.clicker import (
    click_first_match,
    click_window_relative,
    find_text_controls_in_region,
)
from app.automation.extractor import extract_visible_texts
from app.automation.window import connect_autocom_window, get_autocom_window_status
from app.config import (
    DEFAULT_WAIT_AFTER_CLICK,
    DIAGNOSTIC_READY_KEYWORDS,
    GENERIC_OBD_CLICK_X,
    GENERIC_OBD_CLICK_Y,
    HARDWARE_SETUP_KEYWORDS,
)
from app.settings import ensure_runtime_dirs


ensure_runtime_dirs()

app = FastAPI(
    title="Diagnostic Desktop Agent",
    version="0.1.0",
    description="Local-only pywinauto automation agent. Bind only to 127.0.0.1.",
)


class ClickTextRequest(BaseModel):
    text: str
    region: dict[str, int] = Field(default_factory=lambda: {
        "left_min": 0,
        "left_max": 2000,
        "top_min": 0,
        "top_max": 1200,
    })
    relative_to_window: bool = True


class ClickPointRequest(BaseModel):
    x: int
    y: int

class EngineLaunchRequest(BaseModel):
    module: str
    label: str
    shortcut_path: str

FULL_WINDOW_REGION = {
    "left_min": 0,
    "left_max": 2000,
    "top_min": 0,
    "top_max": 1200,
}


def screen_has_any(result: dict, keywords: list[str]) -> bool:
    combined = "\n".join(
        item.get("text", "")
        for item in result.get("texts", [])
    ).lower()

    return any(keyword.lower() in combined for keyword in keywords)


def classify_screen(win) -> dict:
    screen = extract_visible_texts(win)

    if screen_has_any(screen, HARDWARE_SETUP_KEYWORDS):
        return {
            "state": "NEED_VCI_SETUP",
            "message": "Diagnostic engine is waiting for Hardware setup / VCI connection.",
            "available_actions": [
                "hardware_search_vci",
                "hardware_test_vci",
                "screen_texts",
            ],
            "screen": screen,
        }

    if screen_has_any(screen, DIAGNOSTIC_READY_KEYWORDS):
        return {
            "state": "READY_FOR_DIAGNOSIS",
            "message": "Diagnostic engine is ready for diagnostic functions.",
            "available_actions": [
                "get_capabilities",
                "get_obd_functions",
                "get_rtd_functions",
                "run_diagnosis",
            ],
            "screen": screen,
        }

    return {
        "state": "UNKNOWN",
        "message": "Diagnostic engine screen was captured but could not be classified yet.",
        "screen": screen,
    }




def safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def require_autocom_window():
    status = get_autocom_window_status()
    if not status.get("found"):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ENGINE_WINDOW_NOT_FOUND",
                "message": "Diagnostic engine window was not found. Open the configured engine and retry.",
                "visible_windows_count": status.get("visible_windows_count", 0),
            },
        )
    return True


@app.get("/agent/status")
def status():
    return {
        "agent": "running",
        "window": get_autocom_window_status(),
    }


@app.get("/agent/screen/texts")
def screen_texts():
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        return extract_visible_texts(win)

    return safe_call(_run)


@app.post("/agent/ui/click-text")
def click_text(payload: ClickTextRequest):
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        matches = find_text_controls_in_region(
            win=win,
            target_text=payload.text,
            region=payload.region,
            relative_to_window=payload.relative_to_window,
        )
        clicked = click_first_match(matches, payload.text)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)
        return {
            "clicked": True,
            "target": clicked.window_text(),
            "screen": extract_visible_texts(win),
        }

    return safe_call(_run)


@app.post("/agent/ui/click-point")
def click_point(payload: ClickPointRequest):
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        point = click_window_relative(win, payload.x, payload.y)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)
        return {"clicked": True, "point": point, "screen": extract_visible_texts(win)}

    return safe_call(_run)


@app.post("/agent/generic-obd/start")
def start_generic_obd():
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        point = click_window_relative(win, GENERIC_OBD_CLICK_X, GENERIC_OBD_CLICK_Y)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        result = classify_screen(win)
        result["clicked"] = True
        result["point"] = point
        return result

    return safe_call(_run)


@app.post("/agent/hardware/search-vci")
def hardware_search_vci():
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        matches = find_text_controls_in_region(
            win=win,
            target_text="Search",
            region=FULL_WINDOW_REGION,
            relative_to_window=True,
        )
        clicked = click_first_match(matches, "Search")
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        result = classify_screen(win)
        result["clicked"] = True
        result["target"] = clicked.window_text()
        return result

    return safe_call(_run)


@app.post("/agent/hardware/test-vci")
def hardware_test_vci():
    def _run():
        require_autocom_window()
        win = connect_autocom_window()
        matches = find_text_controls_in_region(
            win=win,
            target_text="Test",
            region=FULL_WINDOW_REGION,
            relative_to_window=True,
        )
        clicked = click_first_match(matches, "Test")
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        result = classify_screen(win)
        result["clicked"] = True
        result["target"] = clicked.window_text()
        return result

    return safe_call(_run)

@app.post("/agent/engine/launch")
def launch_engine(payload: EngineLaunchRequest):
    path = Path(payload.shortcut_path)

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ENGINE_PATH_NOT_FOUND",
                "message": "Configured engine shortcut or executable was not found.",
            },
        )

    if path.suffix.lower() not in {".lnk", ".exe"}:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_ENGINE_PATH",
                "message": "Only Windows shortcut or executable paths are supported.",
            },
        )

    os.startfile(str(path))
    return {
        "launched": True,
        "module": payload.module,
        "label": payload.label,
    }
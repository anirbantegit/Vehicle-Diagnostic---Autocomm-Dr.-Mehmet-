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
from app.automation.control_actions import (
    ControlSelector,
    find_first_control,
    perform_native_action,
    wait_for_control_state,
)
from app.automation.extractor import extract_trace_screen, extract_visible_texts
from app.automation.window import (
    connect_autocom_window,
    connect_window_by_handle,
    describe_window,
    get_autocom_window_status,
    list_traceable_windows,
)
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


class NativeControlRequest(BaseModel):
    automation_id: str = ""
    text: str = ""
    control_type: str = ""
    parent_automation_id: str = ""
    action: str = "invoke"
    present: bool = True
    timeout_seconds: float = Field(default=5.0, ge=0.1, le=30.0)


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

def selector_from_request(payload: NativeControlRequest) -> ControlSelector:
    if not payload.automation_id.strip() and not payload.text.strip():
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONTROL_SELECTOR_REQUIRED",
                "message": "Provide automation_id or text for the native control.",
            },
        )

    return ControlSelector(
        automation_id=payload.automation_id.strip(),
        text=payload.text.strip(),
        control_type=payload.control_type.strip(),
        parent_automation_id=payload.parent_automation_id.strip(),
    )


def trace_snapshot(win) -> dict:
    return {
        "window": describe_window(win),
        **extract_trace_screen(win),
    }


def matched_snapshot_control(snapshot: dict, selector: ControlSelector) -> dict | None:
    for control in snapshot.get("controls", []):
        if (
            (not selector.automation_id or control.get("automation_id") == selector.automation_id)
            and (not selector.text or control.get("text", "").casefold() == selector.text.casefold())
            and (not selector.control_type or control.get("control_type", "").casefold() == selector.control_type.casefold())
        ):
            return control
    return None


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

@app.get("/agent/trace/windows")
def trace_windows():
    return {"windows": list_traceable_windows()}


@app.get("/agent/trace/windows/{window_handle}/screen")
def trace_window_screen(window_handle: int):
    def _run():
        win = connect_window_by_handle(window_handle, focus=False)
        return trace_snapshot(win)

    return safe_call(_run)


@app.post("/agent/trace/windows/{window_handle}/click-point")
def trace_window_click_point(window_handle: int, payload: ClickPointRequest):
    def _run():
        # Coordinate clicks are the explicit foreground fallback only.
        win = connect_window_by_handle(window_handle, focus=True)
        point = click_window_relative(win, payload.x, payload.y)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)
        return {
            "clicked": True,
            "point": point,
            **trace_snapshot(win),
            "windows": list_traceable_windows(),
        }

    return safe_call(_run)

@app.post("/agent/trace/windows/{window_handle}/wait-control")
def trace_window_wait_control(window_handle: int, payload: NativeControlRequest):
    def _run():
        win = connect_window_by_handle(window_handle, focus=False)
        selector = selector_from_request(payload)
        _control, confirmed = wait_for_control_state(
            win,
            selector,
            present=payload.present,
            timeout_seconds=payload.timeout_seconds,
        )
        if not confirmed:
            raise HTTPException(
                status_code=408,
                detail={
                    "code": "CONTROL_WAIT_TIMEOUT",
                    "message": "Native control did not reach the requested state before timeout.",
                },
            )

        snapshot = trace_snapshot(win)
        matched_control = matched_snapshot_control(snapshot, selector) if payload.present else None
        if payload.present and matched_control is None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CONTROL_CAPTURE_MISMATCH",
                    "message": "Native control was found but could not be mapped into the trace snapshot.",
                },
            )

        return {
            **snapshot,
            "confirmed": True,
            "present": payload.present,
            "matched_control": matched_control,
        }

    return safe_call(_run)


@app.post("/agent/trace/windows/{window_handle}/control-action")
def trace_window_control_action(window_handle: int, payload: NativeControlRequest):
    def _run():
        win = connect_window_by_handle(window_handle, focus=False)
        control = find_first_control(win, selector_from_request(payload))
        if control is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "CONTROL_NOT_FOUND",
                    "message": "Native control was not found in the selected desktop window.",
                },
            )

        action_result = perform_native_action(control, payload.action)
        if not action_result.get("performed"):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CONTROL_ACTION_FAILED",
                    "message": "Native control action was not performed.",
                    "errors": action_result.get("errors", []),
                },
            )

        time.sleep(0.2)
        return {
            **trace_snapshot(win),
            "action_result": action_result,
        }

    return safe_call(_run)



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
        win = connect_autocom_window(focus=False)
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
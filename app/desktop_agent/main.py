import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
import win32con
import win32gui
from pywinauto import Desktop

from app.automation.clicker import (
    click_first_match,
    click_window_relative,
    find_text_controls_in_region,
)
from app.automation.control_actions import (
    ControlSelector,
    describe_control,
    find_controls,
    find_first_control,
    perform_native_action,
    wait_for_control_state,
)
from app.automation.extractor import extract_trace_screen, extract_visible_texts
from app.automation.rtd_popup import (
    RTD_LOCATION_LIST_ID,
    RTD_POPUP_ACTION_IDS,
    RTD_POPUP_ROOT_ID,
    popup_identity_from_controls,
)
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
from app.diagnostic_logging import get_file_logger
from app.settings import ensure_desktop_agent_runtime_dirs, settings


ensure_desktop_agent_runtime_dirs()
diagnostic_log = get_file_logger(
    "diagnostic_engine_console.desktop_agent",
    settings.agent_log_dir / "desktop-agent.runtime.log",
)
diagnostic_log.info(
    "Desktop Agent startup pid=%s app_env=%s env_file=%s data_dir=%s bind=%s:%s",
    os.getpid(),
    settings.app_env,
    settings.loaded_env_file or "not-found",
    settings.data_dir,
    settings.agent_host,
    settings.agent_port,
)

app = FastAPI(
    title="Diagnostic Engine Console",
    version="0.1.0",
    description="Diagnostic Engine Console desktop automation agent. Bind only to 127.0.0.1.",
)


@app.middleware("http")
async def log_agent_http_failures(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception:
        diagnostic_log.exception(
            "Unhandled Desktop Agent request failure method=%s path=%s",
            request.method,
            request.url.path,
        )
        raise

    if response.status_code >= 400:
        diagnostic_log.warning(
            "Desktop Agent request rejected method=%s path=%s status=%s",
            request.method,
            request.url.path,
            response.status_code,
        )
    return response


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
    fallback_window_handle: int | None = None


class FindWindowControlRequest(NativeControlRequest):
    source_window_handle: int | None = None
    same_process: bool = True


class RtdPopupDiscoveryRequest(BaseModel):
    source_window_handle: int
    baseline_window_handles: list[int] = Field(default_factory=list)
    baseline_windows: list[dict] = Field(default_factory=list)
    baseline_foreground_handle: int | None = None
    timeout_seconds: float = Field(default=6.0, ge=0.1, le=30.0)


class RtdPopupCommandRequest(BaseModel):
    command: str
    location_text: str = ""
    fallback_window_handle: int | None = None


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


def trace_snapshot(win, include_preview: bool = True) -> dict:
    window = describe_window(win)
    related_windows = []
    if window.get("pid") is not None:
        related_windows = [
            candidate
            for candidate in list_traceable_windows()
            if candidate.get("pid") == window["pid"]
        ]

    return {
        "window": window,
        "related_windows": related_windows,
        **extract_trace_screen(win, include_preview=include_preview),
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


def wait_for_window_control(payload: FindWindowControlRequest) -> dict:
    selector = selector_from_request(payload)
    source_pid = None

    if payload.source_window_handle is not None:
        source_window = connect_window_by_handle(payload.source_window_handle, focus=False)
        source_pid = describe_window(source_window).get("pid")

    deadline = time.monotonic() + max(0.1, payload.timeout_seconds)
    while time.monotonic() <= deadline:
        for candidate in Desktop(backend="uia").windows():
            try:
                candidate_info = describe_window(candidate)
                if not candidate_info.get("handle"):
                    continue
                if payload.same_process and source_pid is not None and candidate_info.get("pid") != source_pid:
                    continue

                control = find_first_control(candidate, selector)
                if control is None:
                    continue

                snapshot = trace_snapshot(candidate)
                matched_control = matched_snapshot_control(snapshot, selector)
                if matched_control is None:
                    continue

                return {
                    **snapshot,
                    "confirmed": True,
                    "present": True,
                    "matched_control": matched_control,
                }
            except Exception:
                continue

        time.sleep(0.2)

    raise HTTPException(
        status_code=408,
        detail={
            "code": "CONTROL_WINDOW_WAIT_TIMEOUT",
            "message": "A desktop window containing the requested native control was not detected before timeout.",
        },
    )



def _rtd_popup_action_controls(candidate) -> dict[str, dict]:
    controls: dict[str, dict] = {}
    for action, automation_id in RTD_POPUP_ACTION_IDS.items():
        control = find_first_control(candidate, ControlSelector(automation_id=automation_id, control_type="Button"))
        if control is not None:
            controls[action] = describe_control(control)
    return controls


def _control_handle(control) -> int | None:
    for candidate in (
        lambda: getattr(control, "handle", 0),
        lambda: getattr(control.element_info, "handle", 0),
        lambda: getattr(control.element_info, "native_window_handle", 0),
    ):
        try:
            handle = int(candidate() or 0)
            if handle:
                return handle
        except Exception:
            continue
    return None


def _find_rtd_popup_root(candidate):
    return find_first_control(
        candidate,
        ControlSelector(automation_id=RTD_POPUP_ROOT_ID, control_type="Window"),
    )


def _direct_native_popup_wrapper(handle: int):
    """Connect a Win32-enumerated popup even when Desktop.windows omits it."""
    return Desktop(backend="uia").window(handle=handle).wrapper_object()


def _safe_selected_state(control) -> bool | None:
    resolvers = (
        lambda: bool(control.is_selected()),
        lambda: bool(control.iface_selection_item.CurrentIsSelected),
        lambda: bool(control.element_info.current_is_selected),
    )
    for resolver in resolvers:
        try:
            return resolver()
        except Exception:
            continue
    return None


def _selected_rtd_location_texts(popup_root) -> tuple[set[str] | None, str | None]:
    """Read selected RTD option through native selection APIs, not pixel colour."""
    selected: set[str] = set()
    selection_exposed = False
    location_list = find_first_control(
        popup_root,
        ControlSelector(automation_id=RTD_LOCATION_LIST_ID),
    )
    if location_list is not None:
        for method_name in ("selected_texts", "get_selected_texts"):
            method = getattr(location_list, method_name, None)
            if not callable(method):
                continue
            try:
                selected.update(str(value).strip() for value in (method() or []) if str(value).strip())
                return selected, f"listbox_{method_name}"
            except Exception:
                continue

    items = find_controls(
        popup_root,
        ControlSelector(control_type="ListItem", parent_automation_id=RTD_LOCATION_LIST_ID),
    )
    for item in items:
        is_selected = _safe_selected_state(item)
        if is_selected is None:
            continue
        selection_exposed = True
        if is_selected:
            text = str(describe_control(item).get("text") or "").strip()
            if text:
                selected.add(text)
    return (selected, "uia_selection_item") if selection_exposed else (None, None)


def _popup_signature_result(
    popup_root,
    source_pid: int | None,
    baseline_handles: set[int],
    include_preview: bool = False,
) -> dict:
    # Automatic modal detection must never steal foreground focus merely to take
    # a screenshot. Preview capture remains available through explicit tracing.
    snapshot = trace_snapshot(popup_root, include_preview=include_preview)
    selected_texts, selection_source = _selected_rtd_location_texts(popup_root)
    identity = popup_identity_from_controls(
        snapshot.get("controls", []),
        selected_location_texts=selected_texts,
        selection_source=selection_source,
    )
    popup_info = snapshot.get("window", {})
    popup_handle = popup_info.get("handle") or _control_handle(popup_root)
    if popup_handle:
        popup_info["handle"] = popup_handle
    action_controls = identity.get("action_controls", {})
    confirmed = bool(identity.get("signature_confirmed"))
    return {
        **snapshot,
        "window": popup_info,
        "popup_open": True,
        "blocking": True,
        "confirmed": confirmed,
        "present": True,
        "detection_method": "rtd_popup_identity_signature" if confirmed else "rtd_popup_partial_signature",
        "matched_control": identity.get("root_control") or popup_info,
        "run_button": action_controls.get("run"),
        "action_controls": action_controls,
        "available_actions": identity.get("available_actions", []),
        "locations": identity.get("locations", []),
        "popup_identity": identity,
        "already_open": popup_handle in baseline_handles if popup_handle else False,
        "same_process_as_engine": source_pid is None or popup_info.get("pid") == source_pid,
    }


def active_rtd_popup_state(expected_handle: int | None = None) -> dict:
    partial: dict | None = None
    for candidate_info in list_traceable_windows():
        handle = candidate_info.get("handle")
        if not isinstance(handle, int):
            continue
        if expected_handle is not None and handle != expected_handle:
            continue
        if candidate_info.get("title") != RTD_POPUP_ROOT_ID or not candidate_info.get("visible"):
            continue
        try:
            result = _popup_signature_result(_direct_native_popup_wrapper(handle), candidate_info.get("pid"), set())
        except Exception:
            continue
        if result.get("confirmed"):
            return result
        partial = result
    if partial is not None:
        partial["warning"] = "A FormOBDFunction modal is blocking the desktop, but its full RTD selector signature is not yet available."
        return partial
    return {
        "popup_open": False,
        "blocking": False,
        "confirmed": False,
        "present": False,
        "popup_identity": None,
        "locations": [],
        "action_controls": {},
        "available_actions": [],
    }


def active_blocking_native_popup_state() -> dict:
    """Return the active native blocker before any remote background action.

    RTD is the first fully-templated modal. Other modal families remain blocked
    and explicitly unclassified until an evidence-backed template is added.
    """
    rtd_state = active_rtd_popup_state()
    if rtd_state.get("popup_open"):
        return rtd_state

    windows = list_traceable_windows()
    disabled_engines = [
        item for item in windows
        if item.get("engine_candidate") and item.get("visible") and not item.get("enabled")
    ]
    for engine in disabled_engines:
        pid = engine.get("pid")
        candidate = next(
            (
                item for item in windows
                if item.get("handle") != engine.get("handle")
                and item.get("pid") == pid
                and item.get("visible")
                and item.get("enabled")
                and not item.get("engine_candidate")
            ),
            None,
        )
        if candidate is not None:
            return {
                "popup_open": True,
                "blocking": True,
                "confirmed": False,
                "present": True,
                "detection_method": "unclassified_native_modal",
                "window": candidate,
                "source_window": engine,
                "popup_identity": None,
                "locations": [],
                "action_controls": {},
                "available_actions": [],
                "warning": (
                    "A native modal is blocking the diagnostic engine, but no verified popup "
                    "template matches it yet. Capture a trace before adding controls."
                ),
            }
    return {
        "popup_open": False,
        "blocking": False,
        "confirmed": False,
        "present": False,
        "popup_identity": None,
        "locations": [],
        "action_controls": {},
        "available_actions": [],
    }


def require_rtd_popup_state(window_handle: int) -> dict:
    state = active_rtd_popup_state(expected_handle=window_handle)
    if not state.get("popup_open"):
        active = active_rtd_popup_state()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RTD_POPUP_HANDLE_STALE",
                "message": "The requested RTD popup is no longer the active native modal.",
                "active_popup": active if active.get("popup_open") else None,
            },
        )
    if not state.get("confirmed"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RTD_POPUP_SIGNATURE_INCOMPLETE",
                "message": "The modal is blocking the desktop, but its verified RTD controls are not fully available.",
                "popup": state,
            },
        )
    return state


def command_rtd_popup(window_handle: int, payload: RtdPopupCommandRequest) -> dict:
    before = require_rtd_popup_state(window_handle)
    command = payload.command.strip().lower()
    popup_root = _direct_native_popup_wrapper(window_handle)
    if command == "select_location":
        requested = payload.location_text.strip()
        allowed = {str(item.get("text") or "").strip() for item in before.get("locations", [])}
        if not requested or requested not in allowed:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "RTD_LOCATION_NOT_IN_ACTIVE_POPUP",
                    "message": "The requested location is not exposed by the active RTD popup.",
                    "requested_location": requested,
                    "available_locations": sorted(allowed),
                },
            )
        selector = ControlSelector(
            text=requested,
            control_type="ListItem",
            parent_automation_id=RTD_LOCATION_LIST_ID,
        )
        native_action = "select"
    else:
        automation_id = RTD_POPUP_ACTION_IDS.get(command)
        if automation_id is None:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_RTD_POPUP_ACTION", "message": "Unsupported RTD popup action."},
            )
        selector = ControlSelector(automation_id=automation_id, control_type="Button")
        native_action = "invoke"

    control = find_first_control(popup_root, selector)
    if control is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RTD_SCOPED_CONTROL_NOT_FOUND",
                "message": "The requested control is not present inside the active RTD modal.",
            },
        )
    action_result = perform_native_action(control, native_action)
    if not action_result.get("performed"):
        if command == "cancel":
            win32gui.PostMessage(window_handle, win32con.WM_CLOSE, 0, 0)
            action_result = {"performed": True, "method": "wm_close", "control": describe_control(control)}
        else:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "RTD_SCOPED_ACTION_FAILED",
                    "message": "The action could not be performed on the verified RTD modal control.",
                    "errors": action_result.get("errors", []),
                },
            )
    time.sleep(0.2)
    after = active_rtd_popup_state(expected_handle=window_handle)
    if not after.get("popup_open"):
        after = active_blocking_native_popup_state()
    return {
        **after,
        "requested_command": command,
        "command_result": action_result,
        "state_before": before.get("popup_identity"),
    }


def _window_has_usable_rect(item: dict | None) -> bool:
    rect = (item or {}).get("rect")
    return bool(rect and rect.get("width", 0) > 0 and rect.get("height", 0) > 0)


def _foreground_window_handle() -> int | None:
    try:
        handle = int(win32gui.GetForegroundWindow() or 0)
    except Exception:
        return None
    return handle or None


def _snapshot_candidate(candidate_info: dict) -> dict:
    """Keep Win32-observed visibility even when UIA still exposes a hidden shell."""
    try:
        snapshot = trace_snapshot(connect_window_by_handle(candidate_info["handle"], focus=False))
    except Exception:
        snapshot = {"window": candidate_info, "related_windows": [], "texts": [], "controls": []}
    snapshot["window"] = {**snapshot.get("window", {}), **candidate_info}
    return snapshot


def discover_rtd_popup(payload: RtdPopupDiscoveryRequest) -> dict:
    """Find an RTD WinForms modal using the signatures established by desktop traces."""
    try:
        source_window = connect_window_by_handle(payload.source_window_handle, focus=False)
        source_info = describe_window(source_window)
    except Exception:
        source_info = next(
            (item for item in list_traceable_windows() if item.get("handle") == payload.source_window_handle),
            {"handle": payload.source_window_handle, "pid": None},
        )
    source_pid = source_info.get("pid")
    baseline_by_handle = {
        int(item["handle"]): item
        for item in payload.baseline_windows
        if isinstance(item, dict) and isinstance(item.get("handle"), int)
    }
    baseline_handles = set(payload.baseline_window_handles) | set(baseline_by_handle)
    observed_by_handle: dict[int, dict] = {}
    transition_candidates: dict[int, dict] = {}
    partial_signature: dict | None = None
    deadline = time.monotonic() + max(0.1, payload.timeout_seconds)

    while time.monotonic() <= deadline:
        visited_popup_handles: set[int] = set()

        # The trace proves FormOBDFunction can be Win32-visible while omitted
        # from UIA top-level enumeration. Attach to that modal HWND directly.
        for candidate_info in list_traceable_windows():
            candidate_handle = candidate_info.get("handle")
            if not isinstance(candidate_handle, int):
                continue
            observed_by_handle[candidate_handle] = candidate_info
            if (
                candidate_info.get("title") != RTD_POPUP_ROOT_ID
                or not candidate_info.get("visible")
                or (source_pid is not None and candidate_info.get("pid") != source_pid)
            ):
                continue
            try:
                popup_root = _direct_native_popup_wrapper(candidate_handle)
                result = _popup_signature_result(popup_root, source_pid, baseline_handles)
                visited_popup_handles.add(candidate_handle)
                if result.get("confirmed"):
                    return result
                partial_signature = result
            except Exception:
                continue

        # Fallback for builds that expose FormOBDFunction only as a UIA descendant
        # of the disabled main form. Snapshot the modal root, never the web host.
        for candidate in Desktop(backend="uia").windows():
            try:
                popup_root = _find_rtd_popup_root(candidate)
                if popup_root is None:
                    continue
                popup_handle = _control_handle(popup_root)
                if popup_handle and popup_handle in visited_popup_handles:
                    continue
                result = _popup_signature_result(popup_root, source_pid, baseline_handles)
                if not result.get("same_process_as_engine"):
                    continue
                if result.get("confirmed"):
                    return result
                partial_signature = result
            except Exception:
                continue

        foreground_handle = _foreground_window_handle()
        for candidate_info in list_traceable_windows():
            candidate_handle = candidate_info.get("handle")
            if not isinstance(candidate_handle, int):
                continue
            observed_by_handle[candidate_handle] = candidate_info
            previous = baseline_by_handle.get(candidate_handle)
            current_visible = bool(candidate_info.get("visible"))
            transitioned = []
            if candidate_handle not in baseline_handles and current_visible:
                transitioned.append("new_visible_window")
            if previous and current_visible and not bool(previous.get("visible")):
                transitioned.append("hidden_to_visible")
            if previous and _window_has_usable_rect(candidate_info) and not _window_has_usable_rect(previous):
                transitioned.append("zero_size_to_usable")
            if (
                candidate_handle != payload.source_window_handle
                and foreground_handle == candidate_handle
                and payload.baseline_foreground_handle != candidate_handle
            ):
                transitioned.append("became_foreground")
            if transitioned:
                transition_candidates[candidate_handle] = {
                    "current": candidate_info,
                    "previous": previous,
                    "transition": transitioned,
                    "same_process_as_engine": source_pid is None or candidate_info.get("pid") == source_pid,
                    "foreground": foreground_handle == candidate_handle,
                }
        time.sleep(0.2)

    if partial_signature is not None:
        partial_signature["warning"] = (
            "FormOBDFunction was detected, but its complete location-list and action-button signature "
            "did not become available before timeout."
        )
        return partial_signature

    observed_windows = list(observed_by_handle.values())
    if transition_candidates:
        candidate = sorted(
            transition_candidates.values(),
            key=lambda item: (bool(item["foreground"]), bool(item["same_process_as_engine"]), len(item["transition"])),
            reverse=True,
        )[0]
        current = candidate["current"]
        return {
            **_snapshot_candidate(current),
            "popup_open": True,
            "blocking": True,
            "confirmed": False,
            "present": True,
            "detection_method": "window_state_transition",
            "matched_control": None,
            "run_button": None,
            "action_controls": {},
            "locations": [],
            "popup_identity": None,
            "available_actions": ["cancel"],
            "already_open": current["handle"] in baseline_handles,
            "same_process_as_engine": candidate["same_process_as_engine"],
            "warning": (
                "A native window changed state immediately after the RTD command, but its FormOBDFunction "
                "identity is not exposed through UI Automation. Close is enabled as a safe window-level fallback."
            ),
            "window_transition": candidate,
            "observed_windows": observed_windows,
        }

    raise HTTPException(
        status_code=408,
        detail={
            "code": "RTD_POPUP_WAIT_TIMEOUT",
            "message": "No FormOBDFunction popup identity or native window state transition was detected before timeout.",
            "diagnostics": {
                "source_window": source_info,
                "baseline_windows": payload.baseline_windows,
                "baseline_window_handles": sorted(baseline_handles),
                "baseline_foreground_handle": payload.baseline_foreground_handle,
                "foreground_window_handle_after_wait": _foreground_window_handle(),
                "expected_automation_ids": [RTD_POPUP_ROOT_ID, RTD_LOCATION_LIST_ID, *RTD_POPUP_ACTION_IDS.values()],
                "observed_windows": observed_windows,
            },
        },
    )


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
        diagnostic_log.exception(
            "Desktop Agent operation failed callable=%s",
            getattr(fn, "__qualname__", getattr(fn, "__name__", repr(fn))),
        )
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
    return {
        "foreground_window_handle": _foreground_window_handle(),
        "windows": list_traceable_windows(),
    }

@app.post("/agent/trace/find-window-control")
def trace_find_window_control(payload: FindWindowControlRequest):
    return safe_call(wait_for_window_control, payload)


@app.post("/agent/trace/find-rtd-popup")
def trace_find_rtd_popup(payload: RtdPopupDiscoveryRequest):
    return safe_call(discover_rtd_popup, payload)


@app.get("/agent/trace/active-rtd-popup")
def trace_active_rtd_popup():
    return safe_call(active_rtd_popup_state)


@app.get("/agent/trace/blocking-native-popup")
def trace_blocking_native_popup():
    return safe_call(active_blocking_native_popup_state)


@app.get("/agent/trace/windows/{window_handle}/rtd-popup-state")
def trace_rtd_popup_state(window_handle: int):
    return safe_call(active_rtd_popup_state, window_handle)


@app.post("/agent/trace/windows/{window_handle}/rtd-popup-command")
def trace_rtd_popup_command(window_handle: int, payload: RtdPopupCommandRequest):
    return safe_call(command_rtd_popup, window_handle, payload)


@app.get("/agent/trace/windows/{window_handle}/screen")
def trace_window_screen(window_handle: int, include_preview: bool = True):
    def _run():
        win = connect_window_by_handle(window_handle, focus=False)
        return trace_snapshot(win, include_preview=include_preview)

    return safe_call(_run)


@app.post("/agent/trace/windows/{window_handle}/close")
def trace_window_close(window_handle: int):
    def _run():
        before = next((item for item in list_traceable_windows() if item.get("handle") == window_handle), None)
        if before is None:
            raise HTTPException(status_code=404, detail={"code": "WINDOW_NOT_FOUND", "message": "Native window handle is no longer available."})
        win32gui.PostMessage(window_handle, win32con.WM_CLOSE, 0, 0)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)
        after = next((item for item in list_traceable_windows() if item.get("handle") == window_handle), None)
        return {"closed": after is None or not after.get("visible", False), "window_before": before, "window_after": after}

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
        try:
            snapshot = trace_snapshot(win)
            target_window_closed = False
        except Exception:
            if payload.fallback_window_handle is None:
                raise
            fallback = connect_window_by_handle(payload.fallback_window_handle, focus=False)
            snapshot = trace_snapshot(fallback)
            target_window_closed = True

        return {
            **snapshot,
            "target_window_closed": target_window_closed,
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
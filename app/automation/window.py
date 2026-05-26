import re
import time

from pywinauto import Desktop

from app.config import WINDOW_TITLE_RE


def display_engine_label(title: str) -> str:
    normalized = title.lower()
    if "truck" in normalized:
        return "2021.11 Truck"
    if "car" in normalized:
        return "2021.11 Cars"
    return "Diagnostic Engine"


def _safe_call(fn, fallback=None):
    try:
        return fn()
    except Exception:
        return fallback


def window_area(window):
    rect = _safe_call(window.rectangle)
    if rect is None:
        return 0
    return max(0, rect.right - rect.left) * max(0, rect.bottom - rect.top)


def describe_window(window) -> dict:
    title = (_safe_call(window.window_text, "") or "").strip()
    rect = _safe_call(window.rectangle)
    handle = int(getattr(window, "handle", 0) or 0)
    pattern = re.compile(WINDOW_TITLE_RE, re.IGNORECASE)

    return {
        "handle": handle,
        "pid": _safe_call(window.process_id),
        "title": title,
        "class_name": _safe_call(lambda: window.element_info.class_name, "") or "",
        "control_type": _safe_call(lambda: window.element_info.control_type, "") or "",
        "visible": bool(_safe_call(window.is_visible, False)),
        "enabled": bool(_safe_call(window.is_enabled, False)),
        "engine_candidate": bool(title and pattern.search(title)),
        "engine_label": display_engine_label(title) if title and pattern.search(title) else None,
        "rect": None if rect is None else {
            "left": int(rect.left),
            "top": int(rect.top),
            "right": int(rect.right),
            "bottom": int(rect.bottom),
            "width": max(0, int(rect.right - rect.left)),
            "height": max(0, int(rect.bottom - rect.top)),
        },
    }


def list_visible_windows(desktop):
    titles = []

    for window in desktop.windows():
        try:
            title = window.window_text()
            if title and title.strip():
                titles.append(title.strip())
        except Exception:
            pass

    return titles


def list_traceable_windows() -> list[dict]:
    """List visible top-level windows without activating or focusing them."""
    desktop = Desktop(backend="uia")
    windows: list[dict] = []

    for window in desktop.windows():
        item = describe_window(window)
        if not item["visible"] or not item["handle"] or not item["title"]:
            continue
        if not item["rect"] or item["rect"]["width"] <= 0 or item["rect"]["height"] <= 0:
            continue
        windows.append(item)

    windows.sort(
        key=lambda item: (
            bool(item["engine_candidate"]),
            item["rect"]["width"] * item["rect"]["height"],
        ),
        reverse=True,
    )
    return windows



def find_matching_windows(desktop):
    pattern = re.compile(WINDOW_TITLE_RE, re.IGNORECASE)
    matches = []

    for window in desktop.windows():
        try:
            title = window.window_text()

            if not title or not title.strip():
                continue

            if pattern.search(title.strip()):
                matches.append(window)
        except Exception:
            pass

    return matches


def select_autocom_window(desktop):
    matches = find_matching_windows(desktop)

    if not matches:
        print("Could not find diagnostic engine window.")
        print("Visible window count:", len(list_visible_windows(desktop)))
        raise RuntimeError("Diagnostic engine window not found")

    # Prefer visible/larger window if duplicate matching windows exist.
    matches.sort(
        key=lambda window: (
            bool(window.is_visible()),
            window_area(window),
        ),
        reverse=True,
    )

    selected = matches[0]

    if len(matches) > 1:
        print("Multiple matching diagnostic engine windows found.")
        print("Using configured engine target.")

    return selected


def select_window_by_handle(desktop, handle: int):
    for window in desktop.windows():
        if int(getattr(window, "handle", 0) or 0) == handle:
            return window
    raise RuntimeError(f"Selected window handle is no longer available: {handle}")


def _prepare_window(win, focus: bool = False):
    # UIA inspection/invoke/select works against the selected window handle.
    # Keep passive/background operations from stealing the operator's focus.
    if not focus:
        return win

    try:
        if win.is_minimized():
            win.restore()
    except Exception:
        pass

    try:
        win.set_focus()
        time.sleep(0.2)
    except Exception as exc:
        print("Warning: window focus failed:", str(exc))

    return win


def connect_window_by_handle(handle: int, focus: bool = False):
    desktop = Desktop(backend="uia")
    return _prepare_window(select_window_by_handle(desktop, handle), focus=focus)


def connect_autocom_window(focus: bool = True):
    desktop = Desktop(backend="uia")

    try:
        win = select_autocom_window(desktop)
    except Exception as exc:
        print("Could not connect to diagnostic engine window.")
        print("Visible window count:", len(list_visible_windows(desktop)))
        raise exc

    return _prepare_window(win, focus=focus)


def get_autocom_window_status():
    desktop = Desktop(backend="uia")
    matches = find_matching_windows(desktop)

    if not matches:
        return {
            "found": False,
            "engine_label": None,
            "visible": False,
            "minimized": None,
            "rect": None,
            "visible_windows_count": len(list_visible_windows(desktop)),
        }

    matches.sort(
        key=lambda window: (
            bool(window.is_visible()),
            window_area(window),
        ),
        reverse=True,
    )

    win = matches[0]
    rect = win.rectangle()
    return {
        "found": True,
        "engine_label": display_engine_label(win.window_text()),
        "visible": bool(win.is_visible()),
        "minimized": bool(win.is_minimized()),
        "rect": {"left": rect.left, "top": rect.top, "right": rect.right, "bottom": rect.bottom},
    }
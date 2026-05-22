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


def window_area(window):
    try:
        rect = window.rectangle()
        return max(0, rect.right - rect.left) * max(0, rect.bottom - rect.top)
    except Exception:
        return 0


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



def connect_autocom_window():
    desktop = Desktop(backend="uia")

    try:
        win = select_autocom_window(desktop)
    except Exception as exc:
        print("Could not connect to diagnostic engine window.")
        print("Visible window count:", len(list_visible_windows(desktop)))
        raise exc

    try:
        if win.is_minimized():
            win.restore()
    except Exception:
        pass

    try:
        win.set_focus()
        time.sleep(0.5)
    except Exception as exc:
        print("Warning: window focus failed:", str(exc))

    return win


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
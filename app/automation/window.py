import re
import time
from pywinauto import Desktop
from app.config import WINDOW_TITLE_RE


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
        print("Could not find Autocom window.")
        print("Detected visible windows:")
        for title in list_visible_windows(desktop):
            print("-", title)
        raise RuntimeError("Autocom window not found")

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
        print("Multiple matching Autocom windows found.")
        print("Using:", selected.window_text())

    return selected



def connect_autocom_window():
    desktop = Desktop(backend="uia")

    try:
        win = select_autocom_window(desktop)
    except Exception as exc:
        print("Could not connect to Autocom window.")
        print("Detected visible windows:")
        for title in list_visible_windows(desktop):
            print("-", title)
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
            "title": None,
            "visible": False,
            "minimized": None,
            "rect": None,
            "visible_windows": list_visible_windows(desktop),
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
        "title": win.window_text(),
        "visible": bool(win.is_visible()),
        "minimized": bool(win.is_minimized()),
        "rect": {"left": rect.left, "top": rect.top, "right": rect.right, "bottom": rect.bottom},
    }
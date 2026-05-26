import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ControlSelector:
    automation_id: str = ""
    text: str = ""
    control_type: str = ""
    parent_automation_id: str = ""


def _safe_value(fn, fallback=""):
    try:
        return fn() or fallback
    except Exception:
        return fallback


def describe_control(ctrl) -> dict[str, Any]:
    rect = _safe_value(ctrl.rectangle, None)
    return {
        "text": (_safe_value(ctrl.window_text, "") or "").strip(),
        "automation_id": _safe_value(lambda: ctrl.element_info.automation_id, ""),
        "control_type": _safe_value(lambda: ctrl.element_info.control_type, ""),
        "class_name": _safe_value(lambda: ctrl.element_info.class_name, ""),
        "rect": None if rect is None else {
            "left": int(rect.left),
            "top": int(rect.top),
            "right": int(rect.right),
            "bottom": int(rect.bottom),
            "width": max(0, int(rect.right - rect.left)),
            "height": max(0, int(rect.bottom - rect.top)),
        },
    }


def _matches(ctrl, selector: ControlSelector) -> bool:
    info = describe_control(ctrl)
    return (
        (not selector.automation_id or info["automation_id"] == selector.automation_id)
        and (not selector.text or info["text"].casefold() == selector.text.casefold())
        and (not selector.control_type or info["control_type"].casefold() == selector.control_type.casefold())
    )


def _descendants_including_self(root) -> list:
    try:
        return [root, *root.descendants()]
    except Exception:
        return [root]


def find_controls(win, selector: ControlSelector) -> list:
    search_roots = [win]
    if selector.parent_automation_id:
        parent_selector = ControlSelector(automation_id=selector.parent_automation_id)
        parents = [ctrl for ctrl in _descendants_including_self(win) if _matches(ctrl, parent_selector)]
        if not parents:
            return []
        search_roots = parents

    matches = []
    for root in search_roots:
        for ctrl in _descendants_including_self(root):
            if _matches(ctrl, selector):
                matches.append(ctrl)
    return matches


def find_first_control(win, selector: ControlSelector):
    matches = find_controls(win, selector)
    return matches[0] if matches else None


def wait_for_control_state(
    win,
    selector: ControlSelector,
    present: bool = True,
    timeout_seconds: float = 5.0,
):
    deadline = time.monotonic() + max(0.1, timeout_seconds)
    while time.monotonic() <= deadline:
        control = find_first_control(win, selector)
        found = control is not None
        if found is present:
            return control, True
        time.sleep(0.2)
    return None, False


def perform_native_action(ctrl, action: str = "invoke") -> dict[str, Any]:
    """Invoke a UI Automation control without stealing foreground focus where supported."""
    normalized = action.strip().lower()
    errors: list[str] = []

    if normalized in {"invoke", "click"}:
        # Background API flows must not silently degrade from UIA invoke into a
        # pointer click, which can steal foreground focus. Physical click remains
        # available only when the caller explicitly requests the "click" action.
        method_name = normalized
        method = getattr(ctrl, method_name, None)
        if callable(method):
            try:
                method()
                return {"performed": True, "method": method_name, "control": describe_control(ctrl)}
            except Exception as exc:
                errors.append(f"{method_name}: {exc}")

    if normalized == "select":
        method = getattr(ctrl, "select", None)
        if callable(method):
            try:
                method()
                return {"performed": True, "method": "select", "control": describe_control(ctrl)}
            except Exception as exc:
                errors.append(f"select: {exc}")

    if normalized == "toggle":
        method = getattr(ctrl, "toggle", None)
        if callable(method):
            try:
                method()
                return {"performed": True, "method": "toggle", "control": describe_control(ctrl)}
            except Exception as exc:
                errors.append(f"toggle: {exc}")

    return {
        "performed": False,
        "method": None,
        "control": describe_control(ctrl),
        "errors": errors or [f"Control does not expose a supported '{normalized}' action."],
    }
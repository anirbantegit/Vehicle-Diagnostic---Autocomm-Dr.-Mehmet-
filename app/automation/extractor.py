import base64
import io
import json
from datetime import datetime
from pathlib import Path

from app.automation.window import temporary_capture_focus
from app.config import ROOT_DIR


def rect_to_dict(rect, window_rect=None):
    left = int(rect.left)
    top = int(rect.top)
    right = int(rect.right)
    bottom = int(rect.bottom)
    center_x = int((left + right) / 2)
    center_y = int((top + bottom) / 2)

    result = {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "width": max(0, right - left),
        "height": max(0, bottom - top),
        "center_x": center_x,
        "center_y": center_y,
    }

    if window_rect is not None:
        result.update({
            "relative_left": left - int(window_rect.left),
            "relative_top": top - int(window_rect.top),
            "relative_center_x": center_x - int(window_rect.left),
            "relative_center_y": center_y - int(window_rect.top),
        })

    return result

def _valid_rect(rect) -> bool:
    return bool(rect and rect.right > rect.left and rect.bottom > rect.top)


def capture_window_data_url(win) -> str | None:
    """Return an accurate PNG preview while restoring the previous foreground window."""
    try:
        with temporary_capture_focus(win):
            image = win.capture_as_image()
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:image/png;base64,{encoded}"
    except Exception:
        return None


def extract_visible_texts(win):
    texts = []
    win_rect = win.rectangle()
    window_rect = rect_to_dict(win_rect)

    for ctrl in win.descendants():
        try:
            text = ctrl.window_text()

            if not text or not text.strip():
                continue

            rect = ctrl.rectangle()
            if not _valid_rect(rect):
                continue
            rect_info = rect_to_dict(rect, win_rect)

            texts.append({
                "text": text.strip(),
                "control_type": ctrl.element_info.control_type,
                "automation_id": ctrl.element_info.automation_id,
                "class_name": ctrl.element_info.class_name,
                "rect": str(rect),
                "rect_info": rect_info,
            })
        except Exception:
            pass

    return {
        "timestamp": datetime.now().isoformat(),
        "window_detected": True,
        "window_rect": window_rect,
        "text_count": len(texts),
        "texts": texts
    }

def extract_trace_screen(win, include_preview: bool = True):
    """Capture visible controls, including unnamed icon/custom controls, for tracing."""
    controls = []
    win_rect = win.rectangle()
    window_rect = rect_to_dict(win_rect)

    try:
        candidates = [win, *win.descendants()]
    except Exception:
        candidates = [win]

    for index, ctrl in enumerate(candidates):
        try:
            rect = ctrl.rectangle()
            if not _valid_rect(rect):
                continue

            text = (ctrl.window_text() or "").strip()
            control_type = ctrl.element_info.control_type or "Unknown"
            automation_id = ctrl.element_info.automation_id or ""
            class_name = ctrl.element_info.class_name or ""
            rect_info = rect_to_dict(rect, win_rect)

            # pywinauto may expose outer background containers far outside useful bounds.
            if rect_info["width"] <= 0 or rect_info["height"] <= 0:
                continue

            controls.append({
                "index": index,
                "text": text,
                "label": text or automation_id or f"Unnamed {control_type}",
                "control_type": control_type,
                "automation_id": automation_id,
                "class_name": class_name,
                "rect": str(rect),
                "rect_info": rect_info,
            })
        except Exception:
            pass

    active_modal = next(
        (
            control for control in controls
            if control["automation_id"] == "FormOBDFunction"
            and control["control_type"].casefold() == "window"
        ),
        None,
    )

    return {
        "timestamp": datetime.now().isoformat(),
        "window_detected": True,
        "window_rect": window_rect,
        "control_count": len(controls),
        "controls": controls,
        "active_modal": active_modal,
        "screenshot_data_url": capture_window_data_url(win) if include_preview else None,
    }

def save_extract(result, output_file):
    output_path = Path(output_file)

    if not output_path.is_absolute():
        output_path = ROOT_DIR / output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(result, file, indent=2, ensure_ascii=False)

    print(f"Saved: {output_path}")
    print("Text count:", result["text_count"])


def visible_text_values(win):
    result = extract_visible_texts(win)
    return [item["text"] for item in result["texts"]]


def screen_contains_any(win, keywords):
    values = visible_text_values(win)
    combined = "\n".join(values).lower()

    for keyword in keywords:
        if keyword.lower() in combined:
            return True
    return False
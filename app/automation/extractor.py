import json
from datetime import datetime
from pathlib import Path

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
        "window_title": win.window_text(),
        "window_rect": window_rect,
        "text_count": len(texts),
        "texts": texts
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
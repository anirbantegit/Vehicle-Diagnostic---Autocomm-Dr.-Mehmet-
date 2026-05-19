import json
from datetime import datetime
from pathlib import Path

from app.config import ROOT_DIR


def extract_visible_texts(win):
    texts = []

    for ctrl in win.descendants():
        try:
            text = ctrl.window_text()

            if not text or not text.strip():
                continue

            texts.append({
                "text": text.strip(),
                "control_type": ctrl.element_info.control_type,
                "automation_id": ctrl.element_info.automation_id,
                "class_name": ctrl.element_info.class_name,
                "rect": str(ctrl.rectangle())
            })
        except Exception:
            pass

    return {
        "timestamp": datetime.now().isoformat(),
        "window_title": win.window_text(),
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
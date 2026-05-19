import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.automation.window import connect_autocom_window
from app.automation.clicker import find_text_controls_in_region, click_first_match
from app.automation.extractor import extract_visible_texts, save_extract
from app.config import DEFAULT_WAIT_AFTER_CLICK, OUTPUT_DIR


TARGET_TEXT = sys.argv[1] if len(sys.argv) > 1 else "Diesel"

LEFT_SYSTEM_REGION = {
    # Window-relative region for the left-side system list.
    # This avoids failing when the app window moves on screen.
    "left_min": 120,
    "left_max": 350,
    "top_min": 240,
    "top_max": 560,
}


def main():
    win = connect_autocom_window()

    print("Connected window:", win.window_text())

    matches = find_text_controls_in_region(
        win=win,
        target_text=TARGET_TEXT,
        region=LEFT_SYSTEM_REGION,
        relative_to_window=True
    )

    print(f"Found {len(matches)} matching control(s) for '{TARGET_TEXT}':")

    for index, ctrl in enumerate(matches, start=1):
        print(
            f"{index}. text={ctrl.window_text()} | "
            f"type={ctrl.element_info.control_type} | "
            f"rect={ctrl.rectangle()}"
        )

    clicked = click_first_match(matches, TARGET_TEXT)

    print(f"Clicked: {clicked.window_text()}")

    time.sleep(DEFAULT_WAIT_AFTER_CLICK)

    result = extract_visible_texts(win)
    save_extract(result, OUTPUT_DIR / "after_click_extract.json")


if __name__ == "__main__":
    main()
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.automation.window import connect_autocom_window
from app.automation.extractor import extract_visible_texts, save_extract
from app.config import OUTPUT_DIR

def main():
    win = connect_autocom_window()

    print("Connected window:", win.window_text())

    result = extract_visible_texts(win)
    save_extract(result, OUTPUT_DIR / "current_screen_extract.json")


if __name__ == "__main__":
    main()
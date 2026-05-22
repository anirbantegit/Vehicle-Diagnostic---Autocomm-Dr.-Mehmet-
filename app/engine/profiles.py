import json
import os
from pathlib import Path

from app.settings import ensure_runtime_dirs, settings


ENGINE_LABELS = {
    "cars": "2021.11 Cars",
    "truck": "2021.11 Truck",
}


def _read_profiles() -> dict:
    ensure_runtime_dirs()
    if not settings.engine_profiles_file.exists():
        return {}
    try:
        return json.loads(settings.engine_profiles_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_profiles(profiles: dict) -> None:
    ensure_runtime_dirs()
    tmp_path = settings.engine_profiles_file.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(profiles, indent=2), encoding="utf-8")
    os.replace(tmp_path, settings.engine_profiles_file)


def list_engine_profiles() -> list[dict]:
    profiles = _read_profiles()
    return [
        {
            "module": module,
            "label": label,
            "shortcut_path": profiles.get(module, {}).get("shortcut_path", ""),
            "configured": bool(profiles.get(module, {}).get("shortcut_path")),
        }
        for module, label in ENGINE_LABELS.items()
    ]


def save_engine_profile(module: str, shortcut_path: str) -> dict:
    if module not in ENGINE_LABELS:
        raise ValueError("INVALID_ENGINE_MODULE")

    clean_path = shortcut_path.strip()
    path = Path(clean_path)
    if path.suffix.lower() not in {".lnk", ".exe"}:
        raise ValueError("ENGINE_PATH_MUST_BE_SHORTCUT_OR_EXECUTABLE")

    profiles = _read_profiles()
    profiles[module] = {"shortcut_path": clean_path}
    _write_profiles(profiles)

    return {
        "module": module,
        "label": ENGINE_LABELS[module],
        "shortcut_path": clean_path,
        "configured": True,
    }
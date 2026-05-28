"""Persistent, redacted activity records displayed in the Admin Super Logs page."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.settings import ensure_runtime_dirs, settings

_MAX_ACTIVITY_LOGS = 500
_LOCK = threading.RLock()
_SENSITIVE_KEYS = {
    "access_token",
    "authorization",
    "cookie",
    "csrf_token",
    "pairing_secret",
    "token",
    "token_hash",
    "x-csrf-token",
}


def _log_file() -> Path:
    ensure_runtime_dirs()
    return settings.log_dir / "super-logs.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if str(key).lower() in _SENSITIVE_KEYS else _redact(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, tuple):
        return [_redact(item) for item in value]
    return value


def _read_unlocked() -> list[dict[str, Any]]:
    path = _log_file()
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_unlocked(entries: list[dict[str, Any]]) -> None:
    path = _log_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(entries[:_MAX_ACTIVITY_LOGS], handle, indent=2, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def append_activity_log(
    *,
    level: str,
    source: str,
    action: str,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    duration_ms: int | None = None,
    client: str | None = None,
    request: Any = None,
    response: Any = None,
    error: str | None = None,
    system_log: Any = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": f"srv_{uuid.uuid4().hex}",
        "timestamp": _utc_now(),
        "level": level,
        "source": source,
        "action": action,
    }
    optional = {
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": duration_ms,
        "client": client,
        "request": request,
        "response": response,
        "error": error,
        "system_log": system_log,
    }
    entry.update({key: _redact(value) for key, value in optional.items() if value is not None})
    with _LOCK:
        current = _read_unlocked()
        _write_unlocked([entry, *current])
    return entry


def list_activity_logs() -> list[dict[str, Any]]:
    with _LOCK:
        return _redact(_read_unlocked())


def clear_activity_logs() -> None:
    with _LOCK:
        _write_unlocked([])

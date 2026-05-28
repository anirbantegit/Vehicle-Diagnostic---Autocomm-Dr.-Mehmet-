import hashlib
import json
import os
import platform
import socket
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.settings import ensure_runtime_dirs, settings

BRIDGE_VERSION = "0.1.0"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> dict | None:
    try:
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def _fingerprint_hash(install_id: str, device_name: str) -> str:
    raw_parts = [
        install_id,
        device_name,
        platform.system(),
        platform.release(),
        platform.machine(),
        str(uuid.getnode()),
    ]
    digest = hashlib.sha256("|".join(raw_parts).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _new_identity() -> dict:
    install_id = str(uuid.uuid4())
    device_name = platform.node() or socket.gethostname() or "Diagnostic Engine Console"
    return {
        "device_id": f"brg_{uuid.uuid4().hex[:16]}",
        "install_id": install_id,
        "device_name": device_name,
        "fingerprint_hash": _fingerprint_hash(install_id, device_name),
        "bridge_port": settings.bridge_port,
        "created_at": utc_now_iso(),
    }


def get_identity() -> dict:
    ensure_runtime_dirs()
    identity = _read_json(settings.identity_file)

    if not identity or not identity.get("device_id") or not identity.get("install_id"):
        identity = _new_identity()
        _write_json(settings.identity_file, identity)
        return identity

    changed = False

    if identity.get("bridge_port") != settings.bridge_port:
        identity["bridge_port"] = settings.bridge_port
        changed = True

    if not identity.get("device_name"):
        identity["device_name"] = platform.node() or socket.gethostname() or "Diagnostic Engine Console"
        changed = True

    if not identity.get("fingerprint_hash"):
        identity["fingerprint_hash"] = _fingerprint_hash(identity["install_id"], identity["device_name"])
        changed = True

    if changed:
        _write_json(settings.identity_file, identity)

    return identity


def get_lan_ip() -> str:
    """
    Best-effort LAN IP detection for QR payloads.
    Falls back to localhost if the PC is offline or no LAN adapter is available.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip_address = sock.getsockname()[0]
        return ip_address or "127.0.0.1"
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def get_bridge_base_url() -> str:
    host = settings.bridge_public_host.strip() or get_lan_ip()
    return f"{settings.bridge_public_scheme}://{host}:{settings.bridge_port}"


def public_identity(status: str = "online") -> dict:
    identity = get_identity()
    return {
        "device_id": identity["device_id"],
        "device_name": identity.get("device_name"),
        "bridge_version": BRIDGE_VERSION,
        "bridge_port": settings.bridge_port,
        "base_url": get_bridge_base_url(),
        "status": status,
    }
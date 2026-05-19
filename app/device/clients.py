import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path

from app.device.identity import utc_now_iso
from app.settings import ensure_runtime_dirs, settings


def _read_clients(path: Path | None = None) -> list[dict]:
    ensure_runtime_dirs()
    target = path or settings.clients_file
    if not target.exists():
        return []
    try:
        with open(target, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_clients(clients: list[dict], path: Path | None = None) -> None:
    ensure_runtime_dirs()
    target = path or settings.clients_file
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(target.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as file:
        json.dump(clients, file, indent=2, ensure_ascii=False)
    os.replace(tmp_path, target)


def hash_token(token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _public_client(client: dict) -> dict:
    return {
        "client_id": client.get("client_id"),
        "client_name": client.get("client_name"),
        "client_type": client.get("client_type"),
        "paired_at": client.get("paired_at"),
        "last_seen_at": client.get("last_seen_at"),
        "revoked": bool(client.get("revoked")),
    }


def list_clients() -> list[dict]:
    return [_public_client(client) for client in _read_clients()]


def create_client(client_name: str, client_type: str) -> dict:
    clients = _read_clients()
    token = f"acb_cli_{secrets.token_urlsafe(32)}"
    client = {
        "client_id": f"cli_{secrets.token_hex(4)}",
        "client_name": client_name.strip() or "Unnamed client",
        "client_type": client_type.strip() or "mobile_app",
        "token_hash": hash_token(token),
        "paired_at": utc_now_iso(),
        "last_seen_at": None,
        "revoked": False,
    }
    clients.append(client)
    _write_clients(clients)

    public = _public_client(client)
    public["access_token"] = token
    return public


def verify_client_token(token: str) -> dict | None:
    if not token:
        return None

    clients = _read_clients()
    expected_hash = hash_token(token)
    matched_client = None
    changed = False

    for client in clients:
        if client.get("revoked"):
            continue
        token_hash = client.get("token_hash") or ""
        if hmac.compare_digest(token_hash, expected_hash):
            client["last_seen_at"] = utc_now_iso()
            matched_client = _public_client(client)
            changed = True
            break

    if changed:
        _write_clients(clients)

    return matched_client


def revoke_client(client_id: str) -> dict | None:
    clients = _read_clients()
    revoked_client = None

    for client in clients:
        if client.get("client_id") == client_id:
            client["revoked"] = True
            revoked_client = _public_client(client)
            break

    if revoked_client:
        _write_clients(clients)

    return revoked_client
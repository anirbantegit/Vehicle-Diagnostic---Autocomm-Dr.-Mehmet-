import hashlib
import hmac
import json
import os
import secrets
import threading
import uuid
from pathlib import Path

from app.device.identity import utc_now_iso
from app.settings import ensure_runtime_dirs, settings


_CLIENTS_LOCK = threading.RLock()


def _read_clients_unlocked(path: Path | None = None) -> list[dict]:
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


def _read_clients(path: Path | None = None) -> list[dict]:
    with _CLIENTS_LOCK:
        return _read_clients_unlocked(path)


def _write_clients_unlocked(clients: list[dict], path: Path | None = None) -> None:
    ensure_runtime_dirs()
    target = path or settings.clients_file
    target.parent.mkdir(parents=True, exist_ok=True)
    # A fixed clients.json.tmp races when several authenticated mobile requests
    # arrive together. A unique temporary file also remains safe if a second
    # bridge process briefly overlaps during development or service restart.
    tmp_path = target.with_name(
        f".{target.name}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.tmp"
    )
    try:
        with open(tmp_path, "w", encoding="utf-8") as file:
            json.dump(clients, file, indent=2, ensure_ascii=False)
        os.replace(tmp_path, target)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def _write_clients(clients: list[dict], path: Path | None = None) -> None:
    with _CLIENTS_LOCK:
        _write_clients_unlocked(clients, path)


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
    with _CLIENTS_LOCK:
        clients = _read_clients_unlocked()
        active_clients = [client for client in clients if not client.get("revoked")]
        if len(active_clients) != len(clients):
            _write_clients_unlocked(active_clients)
        return [_public_client(client) for client in active_clients]


def create_client(client_name: str, client_type: str) -> dict:
    with _CLIENTS_LOCK:
        # Product rule: exactly one paired mobile client is retained. Re-pairing
        # invalidates and removes the previous credential rather than leaving
        # disconnected devices visible in the admin panel.
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
        _write_clients_unlocked([client])

        public = _public_client(client)
        public["access_token"] = token
        return public


def verify_client_token(token: str) -> dict | None:
    if not token:
        return None

    with _CLIENTS_LOCK:
        clients = _read_clients_unlocked()
        expected_hash = hash_token(token)
        now = utc_now_iso()

        for client in clients:
            if client.get("revoked"):
                continue
            token_hash = client.get("token_hash") or ""
            if hmac.compare_digest(token_hash, expected_hash):
                # Multiple vehicle workspace calls run in parallel. Avoid an
                # unnecessary write for every call received in the same second.
                if client.get("last_seen_at") != now:
                    client["last_seen_at"] = now
                    _write_clients_unlocked(clients)
                return _public_client(client)

    return None


def remove_client(client_id: str) -> dict | None:
    with _CLIENTS_LOCK:
        clients = _read_clients_unlocked()
        removed_client = next(
            (client for client in clients if client.get("client_id") == client_id),
            None,
        )
        retained_clients = [
            client
            for client in clients
            if client.get("client_id") != client_id and not client.get("revoked")
        ]

        if removed_client or len(retained_clients) != len(clients):
            _write_clients_unlocked(retained_clients)

        return _public_client(removed_client) if removed_client else None


def revoke_client(client_id: str) -> dict | None:
    """Backward-compatible alias for callers upgraded after persisted clients existed."""
    return remove_client(client_id)

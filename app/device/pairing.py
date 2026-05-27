import hmac
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from app.device.clients import create_client
from app.device.identity import get_bridge_base_url, public_identity, utc_now_iso

PAIRING_TTL_SECONDS = 120
_pairing_sessions: dict[str, dict] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def cleanup_expired_pairings() -> None:
    now = _now()
    expired_ids = [
        pairing_id
        for pairing_id, session in _pairing_sessions.items()
        if session["expires_at_dt"] <= now
    ]
    for pairing_id in expired_ids:
        _pairing_sessions.pop(pairing_id, None)


def start_pairing() -> dict:
    cleanup_expired_pairings()

    expires_at = _now() + timedelta(seconds=PAIRING_TTL_SECONDS)
    identity = public_identity()
    pairing_id = f"pair_{secrets.token_hex(6)}"
    pairing_secret = secrets.token_urlsafe(24)

    session = {
        "pairing_id": pairing_id,
        "pairing_secret": pairing_secret,
        "expires_at": _iso(expires_at),
        "expires_at_dt": expires_at,
        "created_at": utc_now_iso(),
        "claimed": False,
    }
    _pairing_sessions[pairing_id] = session
    base_url = get_bridge_base_url()
    pairing_query = urlencode({
        "pairing_id": pairing_id,
        "pairing_secret": pairing_secret,
    })

    return {
        "pairing_id": pairing_id,
        "expires_in": PAIRING_TTL_SECONDS,
        "expires_at": session["expires_at"],
        "pairing_url": f"{base_url}/mobile/pair?{pairing_query}",
        "qr_payload": {
            "v": 1,
            "type": "diagnostic_bridge_pairing",
            "device_id": identity["device_id"],
            "device_name": identity["device_name"],
            "base_url": base_url,
            "pairing_id": pairing_id,
            "pairing_secret": pairing_secret,
            "expires_at": session["expires_at"],
        },
    }


def claim_pairing(pairing_id: str, pairing_secret: str, client_name: str, client_type: str) -> dict:
    cleanup_expired_pairings()

    session = _pairing_sessions.get(pairing_id)
    if not session:
        raise ValueError("PAIRING_NOT_FOUND_OR_EXPIRED")

    if session.get("claimed"):
        raise ValueError("PAIRING_ALREADY_CLAIMED")

    if not hmac.compare_digest(pairing_secret, session.get("pairing_secret", "")):
        raise ValueError("INVALID_PAIRING_SECRET")

    session["claimed"] = True
    client = create_client(client_name=client_name, client_type=client_type)
    session["client_id"] = client["client_id"]
    session["client_name"] = client["client_name"]
    session.pop("pairing_secret", None)
    identity = public_identity()

    return {
        "device_id": identity["device_id"],
        "client_id": client["client_id"],
        "client_name": client["client_name"],
        "client_type": client["client_type"],
        "access_token": client["access_token"],
        "base_url": get_bridge_base_url(),
        "paired_at": client["paired_at"],
    }


def get_pairing_status(pairing_id: str) -> dict:
    cleanup_expired_pairings()
    session = _pairing_sessions.get(pairing_id)

    if not session:
        return {"pairing_id": pairing_id, "status": "expired"}

    if session.get("claimed"):
        return {
            "pairing_id": pairing_id,
            "status": "claimed",
            "client_id": session.get("client_id"),
            "client_name": session.get("client_name"),
        }

    return {
        "pairing_id": pairing_id,
        "status": "pending",
        "expires_at": session["expires_at"],
    }
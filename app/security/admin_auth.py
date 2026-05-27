import hashlib
import hmac
import os
import secrets
import subprocess
from datetime import datetime, timedelta, timezone

from app.settings import ensure_runtime_dirs, settings


_admin_sessions: dict[str, dict] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _restrict_production_secret_file() -> None:
    if settings.app_env != "production" or os.name != "nt":
        return

    subprocess.run(
        [
            "icacls",
            str(settings.admin_secret_file),
            "/inheritance:r",
            "/grant:r",
            "*S-1-5-18:(F)",
            "*S-1-5-32-544:(F)",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def get_or_create_admin_secret() -> str:
    ensure_runtime_dirs()

    if settings.admin_secret_file.exists():
        value = settings.admin_secret_file.read_text(encoding="utf-8").strip()
        if value:
            return value

    secret = secrets.token_urlsafe(64)
    tmp_file = settings.admin_secret_file.with_suffix(".tmp")
    tmp_file.write_text(secret, encoding="utf-8")
    os.replace(tmp_file, settings.admin_secret_file)

    if os.name != "nt":
        os.chmod(settings.admin_secret_file, 0o600)

    _restrict_production_secret_file()
    return secret


def _signed_session_token(session_id: str) -> str:
    secret = get_or_create_admin_secret().encode("utf-8")
    signature = hmac.new(secret, session_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{session_id}.{signature}"


def create_admin_session() -> dict:
    session_id = secrets.token_urlsafe(32)
    cookie_value = _signed_session_token(session_id)
    csrf_token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(seconds=settings.admin_session_ttl_seconds)

    _admin_sessions[_hash_value(cookie_value)] = {
        "csrf_hash": _hash_value(csrf_token),
        "expires_at": expires_at,
    }

    return {
        "cookie_value": cookie_value,
        "csrf_token": csrf_token,
        "expires_at": expires_at.isoformat(),
    }


def validate_admin_session_with_reason(
    cookie_value: str | None,
    csrf_token: str | None = None,
    require_csrf: bool = True,
) -> tuple[bool, str]:
    """Validate an admin session while returning a log-safe rejection reason."""
    if not cookie_value or "." not in cookie_value:
        return False, "cookie_missing_or_malformed"

    session_id, supplied_signature = cookie_value.rsplit(".", 1)
    expected_signature = _signed_session_token(session_id).rsplit(".", 1)[1]
    if not hmac.compare_digest(supplied_signature, expected_signature):
        return False, "cookie_signature_invalid"

    session_key = _hash_value(cookie_value)
    session = _admin_sessions.get(session_key)
    if not session:
        # Sessions are process-local. A browser cookie is stale after the
        # Bridge Service restarts until the Admin UI creates a fresh session.
        return False, "session_not_in_process_memory"

    if session["expires_at"] <= _now():
        _admin_sessions.pop(session_key, None)
        return False, "session_expired"

    if require_csrf:
        if not csrf_token:
            return False, "csrf_missing"
        if not hmac.compare_digest(session["csrf_hash"], _hash_value(csrf_token)):
            return False, "csrf_invalid"

    return True, "valid"


def validate_admin_session(
    cookie_value: str | None,
    csrf_token: str | None = None,
    require_csrf: bool = True,
) -> bool:
    valid, _ = validate_admin_session_with_reason(
        cookie_value,
        csrf_token,
        require_csrf,
    )
    return valid


def revoke_admin_session(cookie_value: str | None) -> None:
    if cookie_value:
        _admin_sessions.pop(_hash_value(cookie_value), None)
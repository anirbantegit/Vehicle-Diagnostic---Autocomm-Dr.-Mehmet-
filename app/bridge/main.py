import asyncio
import time

import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, Security, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.autocom.rest_client import AutocomRestClient
from app.autocom.signalr_legacy import ClassicSignalRClient
from app.bridge.activity_logs import append_activity_log, clear_activity_logs, list_activity_logs
from app.bridge.schemas import (
    EngineProfileRequest,
    FavouriteRequest,
    PairingClaimRequest,
    RunDiagnosisRequest,
    RtdFunctionOpenRequest,
    SignalRSendRequest,
    VehicleContextRequest,
    VehicleSelectionRequest,
    VinSelectionRequest,
)
from app.diagnostic_logging import get_file_logger
from app.device.clients import list_clients, remove_client, verify_client_token
from app.device.identity import public_identity
from app.device.pairing import claim_pairing, get_pairing_status, start_pairing
from app.security.admin_auth import (
    create_admin_session,
    get_or_create_admin_secret,
    revoke_admin_session,
    validate_admin_session,
    validate_admin_session_with_reason,
)
from app.settings import ensure_runtime_dirs, settings
from app.engine.profiles import ENGINE_LABELS, list_engine_profiles, save_engine_profile


ensure_runtime_dirs()
diagnostic_log = get_file_logger(
    "diagnostic_engine_console.bridge",
    settings.log_dir / "bridge-diagnostics.log",
)
diagnostic_log.info(
    "Bridge startup app_env=%s env_file=%s data_dir=%s bridge=%s:%s agent=%s native_api=%s signalr=%s",
    settings.app_env,
    settings.loaded_env_file or "not-found",
    settings.data_dir,
    settings.bridge_host,
    settings.bridge_port,
    settings.agent_base_url,
    settings.autocom_api_base,
    settings.autocom_signalr_base,
)
try:
    get_or_create_admin_secret()
except Exception:
    diagnostic_log.exception("Bridge startup failed while creating or reading the local admin secret.")
    raise

rest_client = AutocomRestClient()
signalr_client = ClassicSignalRClient()

app = FastAPI(
    title="Diagnostic Engine Console",
    version="0.1.0",
    description="Local Diagnostic Engine Console bridge service and desktop automation gateway.",
)


_ACTIVITY_EXCLUDED_PATHS = {
    "/bridge/admin/super-logs",
}


def record_activity_safely(**entry):
    try:
        append_activity_log(**entry)
    except Exception:
        # Observability must never become the reason a diagnostic request fails.
        diagnostic_log.exception("Unable to persist a Super Logs activity record.")


@app.middleware("http")
async def record_bridge_activity(request: Request, call_next):
    """Persist API outcomes so admin Super Logs also covers mobile requests."""
    path = request.url.path
    if not path.startswith("/bridge/") or path in _ACTIVITY_EXCLUDED_PATHS:
        return await call_next(request)

    started_at = time.perf_counter()
    remote = request.client.host if request.client else "unknown"
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        record_activity_safely(
            level="error",
            source="bridge-server",
            action="request_failed",
            method=request.method,
            path=path,
            duration_ms=duration_ms,
            client=remote,
            error=f"{type(exc).__name__}: {exc}",
        )
        diagnostic_log.exception(
            "Unhandled bridge request failure method=%s path=%s remote=%s",
            request.method,
            path,
            remote,
        )
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000)
    record_activity_safely(
        level="success" if response.status_code < 400 else "error",
        source="bridge-server",
        action="request_completed" if response.status_code < 400 else "request_rejected",
        method=request.method,
        path=path,
        status_code=response.status_code,
        duration_ms=duration_ms,
        client=remote,
    )
    return response


bridge_auth_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="PairedDeviceBearerAuth",
    description="Bearer token issued only to a paired mobile client.",
)

# Keep UI asset routes registered in debug mode even when the developer starts
# the bridge before running either Vite production build. Once a dist folder
# is created, the already-running bridge can immediately serve its files.
admin_assets_dir = settings.web_admin_dist_dir / "assets"
app.mount(
    "/admin/assets",
    StaticFiles(directory=str(admin_assets_dir), check_dir=False),
    name="admin-assets",
)

mobile_assets_dir = settings.web_mobile_dist_dir / "assets"
app.mount(
    "/mobile/assets",
    StaticFiles(directory=str(mobile_assets_dir), check_dir=False),
    name="mobile-assets",
)


def serve_admin_index():
    if not settings.web_admin_index_file.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ADMIN_UI_NOT_BUILT",
                "message": "React Admin UI is not built yet. Run pnpm install && pnpm run build inside admin-ui.",
            },
        )
    return FileResponse(settings.web_admin_index_file)


@app.get("/admin", include_in_schema=False)
def admin_root():
    return serve_admin_index()


@app.get("/admin/{path:path}", include_in_schema=False)
def admin_spa_fallback(path: str):
    return serve_admin_index()


def serve_mobile_index():
    if not settings.web_mobile_index_file.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "code": "MOBILE_UI_NOT_BUILT",
                "message": "Mobile Portal is not built yet. Run pnpm run build:mobile inside admin-ui.",
            },
        )
    return FileResponse(settings.web_mobile_index_file)


@app.get("/mobile", include_in_schema=False)
def mobile_root():
    return serve_mobile_index()


@app.get("/mobile/{path:path}", include_in_schema=False)
def mobile_spa_fallback(path: str):
    leaf_name = path.rsplit("/", 1)[-1]
    if path.startswith("assets/") or "." in leaf_name:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "MOBILE_ASSET_NOT_FOUND",
                "message": (
                    f"Mobile Portal asset was not found: /mobile/{path}. "
                    "Run pnpm run build:mobile and reload."
                ),
            },
        )
    return serve_mobile_index()


class ClickTextRequest(BaseModel):
    text: str
    region: dict[str, int] = Field(default_factory=lambda: {
        "left_min": 0,
        "left_max": 2000,
        "top_min": 0,
        "top_max": 1200,
    })
    relative_to_window: bool = True


class ClickPointRequest(BaseModel):
    x: int
    y: int

class NativeControlRequest(BaseModel):
    automation_id: str = ""
    text: str = ""
    control_type: str = ""
    parent_automation_id: str = ""
    action: str = "invoke"
    present: bool = True
    timeout_seconds: float = Field(default=5.0, ge=0.1, le=30.0)
    fallback_window_handle: int | None = None


class RtdOpenRequest(BaseModel):
    window_handle: int
    rtd_index: int
    timeout_seconds: float = Field(default=6.0, ge=0.1, le=30.0)


class RtdPopupActionRequest(BaseModel):
    window_handle: int
    fallback_window_handle: int | None = None
    action: str
    window_close_fallback: bool = False


class RtdLocationRequest(BaseModel):
    window_handle: int
    fallback_window_handle: int | None = None
    location_text: str = Field(min_length=1)


def extract_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = None,
    authorization: str | None = None,
) -> str | None:

    # Preferred Swagger/OpenAPI path:
    # Authorization: Bearer <token>
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    # Manual fallback for curl/Postman/custom clients.
    if authorization:
        value = authorization.strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value

    return None


def require_loopback(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "::1"}:
        diagnostic_log.warning(
            "Rejected non-loopback admin access path=%s client=%s",
            request.url.path,
            host or "unknown",
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LOCAL_ADMIN_ONLY",
                "message": "The Admin Console is available only from this computer.",
            },
        )


def require_admin_session(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> dict:
    require_loopback(request)
    cookie_value = request.cookies.get(settings.admin_session_cookie_name)
    valid, reason = validate_admin_session_with_reason(
        cookie_value,
        x_csrf_token,
        require_csrf=True,
    )

    if not valid:
        diagnostic_log.warning(
            "Admin session rejected path=%s client=%s reason=%s cookie_present=%s csrf_present=%s",
            request.url.path,
            request.client.host if request.client else "unknown",
            reason,
            bool(cookie_value),
            bool(x_csrf_token),
        )
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_ADMIN_SESSION",
                "message": "Local Admin Console session is missing or expired.",
                "reason": reason,
            },
        )

    return {"type": "admin"}


def require_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(bridge_auth_scheme),
    authorization: str | None = Header(default=None, include_in_schema=False),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    admin_cookie = request.cookies.get(settings.admin_session_cookie_name)
    admin_valid, admin_reason = validate_admin_session_with_reason(
        admin_cookie,
        x_csrf_token,
        require_csrf=True,
    )
    if admin_valid:
        return {"type": "admin"}

    supplied_token = extract_bearer_token(credentials, authorization)

    client = verify_client_token(supplied_token or "")
    if client:
        return {"type": "client", "client": client}

    diagnostic_log.warning(
        "Bridge token rejected path=%s client=%s admin_reason=%s cookie_present=%s csrf_present=%s bearer_present=%s",
        request.url.path,
        request.client.host if request.client else "unknown",
        admin_reason,
        bool(admin_cookie),
        bool(x_csrf_token),
        bool(supplied_token),
    )
    raise HTTPException(
        status_code=401,
        detail={
            "code": "INVALID_BRIDGE_TOKEN",
            "message": "Invalid local admin session or paired-device token.",
            "expected_header": "Authorization: Bearer <paired-device-token>",
            "admin_session_reason": admin_reason,
        },
    )

def require_paired_client(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(bridge_auth_scheme),
    authorization: str | None = Header(default=None, include_in_schema=False),
) -> dict:
    supplied_token = extract_bearer_token(credentials, authorization)
    client = verify_client_token(supplied_token or "")
    if client:
        return client

    diagnostic_log.warning(
        "Mobile token rejected path=%s client=%s bearer_present=%s",
        request.url.path,
        request.client.host if request.client else "unknown",
        bool(supplied_token),
    )
    raise HTTPException(
        status_code=401,
        detail={
            "code": "INVALID_MOBILE_TOKEN",
            "message": "This mobile session is no longer paired. Scan a fresh QR code from the PC console.",
        },
    )


def _call_name(fn) -> str:
    return getattr(fn, "__qualname__", getattr(fn, "__name__", repr(fn)))


def safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        diagnostic_log.exception("Dependency call failed callable=%s", _call_name(fn))
        raise HTTPException(status_code=500, detail=str(exc))


def diagnostic_engine_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except requests.exceptions.RequestException as exc:
        diagnostic_log.exception(
            "Diagnostic Engine Console local API request failed callable=%s endpoint=%s",
            _call_name(fn),
            settings.autocom_api_base,
        )
        record_activity_safely(
            level="error",
            source="diagnostic-engine",
            action="native_api_unavailable",
            path=settings.autocom_api_base,
            error=f"{_call_name(fn)}: {exc}",
        )
        raise HTTPException(
            status_code=502,
            detail={
                "code": "DIAGNOSTIC_ENGINE_LOCAL_API_UNAVAILABLE",
                "message": (
                    "Diagnostic Engine Console local API is unavailable at "
                    f"{settings.autocom_api_base}. Open the configured engine and confirm its local API is listening."
                ),
                "endpoint": settings.autocom_api_base,
                "reason": str(exc),
            },
        )
    except Exception as exc:
        diagnostic_log.exception(
            "Diagnostic Engine Console local API response failed callable=%s endpoint=%s",
            _call_name(fn),
            settings.autocom_api_base,
        )
        record_activity_safely(
            level="error",
            source="diagnostic-engine",
            action="native_api_response_failed",
            path=settings.autocom_api_base,
            error=f"{_call_name(fn)}: {exc}",
        )
        raise HTTPException(
            status_code=502,
            detail={
                "code": "DIAGNOSTIC_ENGINE_LOCAL_API_FAILED",
                "message": "Diagnostic Engine Console local API returned an unusable response.",
                "endpoint": settings.autocom_api_base,
                "reason": str(exc),
            },
        )


VEHICLE_LIST_TYPES = {
    "brands",
    "models",
    "years",
    "systemTypes",
    "engines",
    "systems",
    "gearboxes",
    "equipments",
}


def require_vehicle_list_type(list_type: str) -> str:
    if list_type not in VEHICLE_LIST_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_VEHICLE_LIST_TYPE",
                "message": "Unsupported vehicle-selection list type.",
            },
        )
    return list_type


def require_vehicle_definition_id(vehicle_definition_id: str) -> str:
    clean_id = vehicle_definition_id.strip()
    if not clean_id:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VEHICLE_DEFINITION_REQUIRED",
                "message": "Select a vehicle context before running this action.",
            },
        )
    return clean_id


def normalize_vin(vin: str) -> str:
    raw_vin = "".join(vin.split()).upper()
    if len(raw_vin) not in {0, 3, 17}:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_VIN_LENGTH",
                "message": "VIN lookup accepts a three-character WMI prefix or a complete 17-character VIN.",
            },
        )

    if not raw_vin:
        return ""

    if len(raw_vin) == 3:
        # Match the recovered frontend: once the WMI is entered it sends the
        # three VIN characters followed by the display separator.
        return f"{raw_vin} "

    return f"{raw_vin[:3]} {raw_vin[3:11]} {raw_vin[11:]}"


def agent_request(method: str, path: str, json_body=None, timeout: int = 15):
    url = settings.agent_base_url + path
    try:
        response = requests.request(method, url, json=json_body, timeout=timeout)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()
    except requests.exceptions.HTTPError as exc:
        response = exc.response
        try:
            detail = response.json()
        except Exception:
            detail = response.text if response is not None else str(exc)

        status_code = response.status_code if response is not None else 502
        system_message = (
            f"Desktop Agent rejected {method} {path} with HTTP {status_code}. "
            "The response and selector request are retained for native automation diagnosis."
        )
        diagnostic_log.warning(
            "Desktop Agent HTTP failure method=%s url=%s status=%s request=%s detail=%s",
            method,
            url,
            status_code,
            json_body,
            detail,
        )
        record_activity_safely(
            level="warning" if status_code < 500 else "error",
            source="desktop-agent",
            action="desktop_agent_request_rejected",
            method=method,
            path=path,
            status_code=status_code,
            request=json_body,
            response=detail,
            error=system_message,
            system_log={"logger": "bridge-diagnostics.log", "message": system_message},
        )
        raise HTTPException(status_code=status_code, detail=detail)
    except requests.exceptions.RequestException as exc:
        system_message = f"Desktop Agent request failed for {method} {path}: {exc}"
        diagnostic_log.exception("Desktop Agent unreachable method=%s url=%s request=%s", method, url, json_body)
        record_activity_safely(
            level="error",
            source="desktop-agent",
            action="desktop_agent_unreachable",
            method=method,
            path=path,
            status_code=502,
            request=json_body,
            error=system_message,
            system_log={"logger": "bridge-diagnostics.log", "message": system_message},
        )
        raise HTTPException(
            status_code=502,
            detail={
                "code": "DESKTOP_AGENT_UNREACHABLE",
                "message": "Desktop Agent request failed.",
                "reason": str(exc),
            },
        )


def find_engine_window_handle() -> int:
    windows_response = agent_request("GET", "/agent/trace/windows", timeout=15)
    windows = windows_response.get("windows", []) if isinstance(windows_response, dict) else []
    engine_windows = [
        window for window in windows
        if isinstance(window, dict) and window.get("engine_candidate") and isinstance(window.get("handle"), int)
    ]
    interactive_windows = [
        window for window in engine_windows
        if window.get("visible")
        and isinstance(window.get("rect"), dict)
        and window["rect"].get("width", 0) > 0
        and window["rect"].get("height", 0) > 0
    ]
    if interactive_windows:
        interactive_windows.sort(
            key=lambda window: window["rect"].get("width", 0) * window["rect"].get("height", 0),
            reverse=True,
        )
        return interactive_windows[0]["handle"]
    if engine_windows:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ENGINE_WINDOW_NOT_INTERACTIVE",
                "message": (
                    "Only hidden or zero-size Diagnostic Engine Console windows were detected. "
                    "Restore the active Cars/Trucks application window and retry the RTD action."
                ),
                "detected_engine_windows": engine_windows,
            },
        )
    raise HTTPException(
        status_code=409,
        detail={
            "code": "ENGINE_WINDOW_NOT_FOUND",
            "message": "No active Diagnostic Engine Console window is available for RTD popup control.",
        },
    )


def require_rtd_function(vehicle_definition_id: str, rtd_index: int, protocol: str | None):
    functions = diagnostic_engine_call(rest_client.get_rtd_functions, vehicle_definition_id, protocol)
    if not isinstance(functions, list):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RTD_FUNCTION_LIST_UNAVAILABLE",
                "message": "Diagnostic Engine Console did not return an RTD function list for the active vehicle context.",
            },
        )

    selected_function = next(
        (
            item for item in functions
            if isinstance(item, dict) and str(item.get("index")) == str(rtd_index)
        ),
        None,
    )
    if selected_function is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "RTD_FUNCTION_NOT_FOUND",
                "message": "The selected RTD function does not belong to the active vehicle context.",
            },
        )
    return selected_function


def active_native_blocking_popup() -> dict:
    return agent_request("GET", "/agent/trace/blocking-native-popup", timeout=15)


def require_no_blocking_native_popup(requested_action: str) -> None:
    popup = active_native_blocking_popup()
    if not popup.get("popup_open"):
        return
    identity = popup.get("popup_identity") if isinstance(popup.get("popup_identity"), dict) else None
    raise HTTPException(
        status_code=409,
        detail={
            "code": "NATIVE_POPUP_BLOCKING_DESKTOP",
            "message": (
                "A native popup is blocking the Diagnostic Engine Console. "
                "Complete or close that popup before running another desktop action."
            ),
            "requested_action": requested_action,
            "popup_template": identity.get("kind") if identity else None,
            "popup_state": popup,
        },
    )


def native_popup_contract(
    popup_screen: dict,
    *,
    sent=None,
    command_sent: bool | None = None,
    confirmation: str | None = None,
    warning: str | None = None,
) -> dict:
    popup_open = bool(popup_screen.get("popup_open"))
    identity = popup_screen.get("popup_identity") if isinstance(popup_screen.get("popup_identity"), dict) else None
    is_confirmed_rtd = bool(popup_screen.get("confirmed")) and bool(identity and identity.get("kind") == "rtd_obd_function_popup")
    action_controls = popup_screen.get("action_controls", {}) if is_confirmed_rtd else {}
    available_actions = popup_screen.get("available_actions", []) if is_confirmed_rtd else []
    window = popup_screen.get("window") if isinstance(popup_screen.get("window"), dict) else {}
    result = {
        "popup_open": popup_open,
        "blocking": bool(popup_screen.get("blocking")) if popup_open else False,
        "confirmed": is_confirmed_rtd,
        "command_sent": command_sent,
        "sent": sent,
        "detection_method": popup_screen.get("detection_method"),
        "popup_template": identity.get("kind") if identity else None,
        "available_actions": available_actions,
        "popup_window_handle": window.get("handle"),
        "popup": popup_screen.get("matched_control") or window or None,
        "popup_identity": identity,
        "locations": popup_screen.get("locations", []) if is_confirmed_rtd else [],
        "action_controls": action_controls,
        "run_button": popup_screen.get("run_button") if is_confirmed_rtd else None,
        "run_button_confirmed": isinstance(action_controls.get("run"), dict),
        "screen": popup_screen,
        "command_result": popup_screen.get("command_result"),
    }
    if not popup_open:
        result["confirmation"] = confirmation or "The RTD native popup is no longer open."
        result["warning"] = warning
        return result
    if is_confirmed_rtd:
        result["confirmation"] = confirmation or "Native RTD popup detected through its verified control template."
        result["warning"] = warning or popup_screen.get("warning")
        return result
    result["confirmation"] = "A blocking native popup was detected, but it is not yet mapped to an automation template."
    result["warning"] = warning or popup_screen.get("warning") or (
        "No action is enabled for an unclassified modal. Capture its trace and add a verified template first."
    )
    return result


def open_native_rtd_popup(source_window_handle: int, rtd_index: int, timeout_seconds: float):
    existing = active_native_blocking_popup()
    if existing.get("popup_open"):
        result = native_popup_contract(existing, sent=None, command_sent=False)
        result["already_open"] = True
        result["warning"] = (
            "A native popup was already open, so no new RTD launch command was sent. "
            "Handle the blocking popup first."
        )
        return result

    before = agent_request("GET", "/agent/trace/windows", timeout=15)
    baseline_windows = before.get("windows", []) if isinstance(before, dict) else []
    baseline_handles = [
        window["handle"]
        for window in baseline_windows
        if isinstance(window, dict) and isinstance(window.get("handle"), int)
    ]
    baseline_foreground_handle = before.get("foreground_window_handle") if isinstance(before, dict) else None

    sent = safe_call(signalr_client.send, "viewRTDHelpDocument", rtd_index)
    selector_request = {
        "source_window_handle": source_window_handle,
        "baseline_window_handles": baseline_handles,
        "baseline_windows": baseline_windows,
        "baseline_foreground_handle": baseline_foreground_handle,
        "timeout_seconds": timeout_seconds,
    }
    try:
        popup_screen = agent_request(
            "POST",
            "/agent/trace/find-rtd-popup",
            selector_request,
            timeout=max(15, round(timeout_seconds) + 5),
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
        diagnostics = detail.setdefault("diagnostics", {})
        diagnostics.update({
            "rtd_index": rtd_index,
            "signalr_send_result": sent,
            "signalr_status_after_send": signalr_client.status(),
            "source_window_handle": source_window_handle,
            "selector_request": selector_request,
        })
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
    result = native_popup_contract(popup_screen, sent=sent, command_sent=True)
    result["already_open"] = bool(popup_screen.get("already_open"))
    return result


def invoke_native_rtd_popup_action(payload: RtdPopupActionRequest):
    result = agent_request(
        "POST",
        f"/agent/trace/windows/{payload.window_handle}/rtd-popup-command",
        {
            "command": payload.action,
            "fallback_window_handle": payload.fallback_window_handle,
        },
        timeout=30,
    )
    return native_popup_contract(result, command_sent=True)


def select_native_rtd_location(payload: RtdLocationRequest):
    result = agent_request(
        "POST",
        f"/agent/trace/windows/{payload.window_handle}/rtd-popup-command",
        {
            "command": "select_location",
            "location_text": payload.location_text.strip(),
            "fallback_window_handle": payload.fallback_window_handle,
        },
        timeout=30,
    )
    return native_popup_contract(result, command_sent=True)


def autocom_get(path: str):
    return diagnostic_engine_call(rest_client.get, path)

@app.get("/bridge/public/identity")
def bridge_public_identity():
    return public_identity()

@app.post("/bridge/admin/session")
def bridge_admin_session(response: Response, request: Request):
    require_loopback(request)
    session = create_admin_session()
    diagnostic_log.info(
        "Issued local admin session client=%s expires_at=%s",
        request.client.host if request.client else "unknown",
        session["expires_at"],
    )
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=session["cookie_value"],
        httponly=True,
        samesite="strict",
        secure=settings.bridge_tls_enabled,
        max_age=settings.admin_session_ttl_seconds,
        path="/",
    )
    return {
        "authenticated": True,
        "csrf_token": session["csrf_token"],
        "expires_at": session["expires_at"],
    }


@app.delete("/bridge/admin/session")
def bridge_admin_logout(
    response: Response,
    request: Request,
    _: dict = Depends(require_admin_session),
):
    revoke_admin_session(request.cookies.get(settings.admin_session_cookie_name))
    response.delete_cookie(settings.admin_session_cookie_name, path="/")
    return {"authenticated": False}


@app.post("/bridge/pairing/start")
def bridge_pairing_start(_: dict = Depends(require_admin_session)):
    return start_pairing()


@app.post("/bridge/pairing/claim")
def bridge_pairing_claim(payload: PairingClaimRequest, request: Request):
    try:
        paired = claim_pairing(
            pairing_id=payload.pairing_id,
            pairing_secret=payload.pairing_secret,
            client_name=payload.client_name,
            client_type=payload.client_type,
        )
        diagnostic_log.info(
            "Mobile paired client_id=%s client_type=%s remote=%s",
            paired["client_id"],
            paired["client_type"],
            request.client.host if request.client else "unknown",
        )
        return paired
    except ValueError as exc:
        code = str(exc)
        status_code = 401 if code == "INVALID_PAIRING_SECRET" else 404
        raise HTTPException(
            status_code=status_code,
            detail={
                "code": code,
                "message": "Pairing session is invalid, expired, already claimed, or secret did not match.",
            },
        )


@app.get("/bridge/mobile/session")
def bridge_mobile_session(client: dict = Depends(require_paired_client)):
    native_api_status = rest_client.health()
    return {
        "paired": True,
        "device": public_identity(),
        "client": client,
        "engine": {
            "local_api_reachable": bool(native_api_status.get("ok")),
            "local_api_endpoint": settings.autocom_api_base,
            "local_api_error": None if native_api_status.get("ok") else native_api_status.get("error"),
        },
    }


@app.delete("/bridge/mobile/session")
def bridge_disconnect_mobile_session(client: dict = Depends(require_paired_client)):
    removed = remove_client(client["client_id"])
    return {"disconnected": bool(removed)}


@app.get("/bridge/clients")
def bridge_clients(_: dict = Depends(require_admin_session)):
    return {"clients": list_clients()}

@app.get("/bridge/admin/super-logs")
def bridge_super_logs(_: dict = Depends(require_admin_session)):
    return {"logs": list_activity_logs()}


@app.delete("/bridge/admin/super-logs")
def bridge_clear_super_logs(_: dict = Depends(require_admin_session)):
    clear_activity_logs()
    return {"cleared": True}



def _remove_paired_client(client_id: str) -> dict:
    removed = remove_client(client_id)
    if not removed:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CLIENT_NOT_FOUND",
                "message": "Paired client was not found.",
            },
        )
    return {"removed": True, "client": removed}


@app.delete("/bridge/clients/{client_id}")
def bridge_remove_client(client_id: str, _: dict = Depends(require_admin_session)):
    return _remove_paired_client(client_id)


@app.post("/bridge/clients/{client_id}/revoke", include_in_schema=False)
def bridge_revoke_client(client_id: str, _: dict = Depends(require_admin_session)):
    # Compatibility route for an already-open older admin frontend bundle.
    return _remove_paired_client(client_id)



@app.get("/bridge/status")
def bridge_status(_: dict = Depends(require_admin_session)):
    agent_status = None
    agent_error = None

    try:
        agent_status = agent_request("GET", "/agent/status", timeout=3)
    except HTTPException as exc:
        agent_error = exc.detail

    return {
        "bridge": "running",
        "bridge_host": settings.bridge_host,
        "bridge_port": settings.bridge_port,
        "agent_base_url": settings.agent_base_url,
        "autocom_api_base": settings.autocom_api_base,
        "autocom_signalr_base": settings.autocom_signalr_base,
        "agent": agent_status,
        "agent_error": agent_error,
    }


@app.get("/bridge/agent/status")
def bridge_agent_status(_: dict = Depends(require_admin_session)):
    return agent_request("GET", "/agent/status")


@app.get("/bridge/screen/texts")
def bridge_screen_texts(_: dict = Depends(require_admin_session)):
    return agent_request("GET", "/agent/screen/texts")

@app.get("/bridge/admin/trace/windows")
def bridge_trace_windows(_: dict = Depends(require_admin_session)):
    return agent_request("GET", "/agent/trace/windows")


@app.get("/bridge/admin/trace/windows/{window_handle}/screen")
def bridge_trace_window_screen(
    window_handle: int,
    include_preview: bool = True,
    _: dict = Depends(require_admin_session),
):
    preview_query = "" if include_preview else "?include_preview=false"
    return agent_request(
        "GET",
        f"/agent/trace/windows/{window_handle}/screen{preview_query}",
        timeout=30,
    )


@app.post("/bridge/admin/trace/windows/{window_handle}/click-point")
def bridge_trace_window_click_point(
    window_handle: int,
    payload: ClickPointRequest,
    _: dict = Depends(require_admin_session),
):
    require_no_blocking_native_popup("trace_click_point")
    return agent_request(
        "POST",
        f"/agent/trace/windows/{window_handle}/click-point",
        payload.model_dump(),
        timeout=30,
    )

@app.post("/bridge/admin/trace/windows/{window_handle}/wait-control")
def bridge_trace_window_wait_control(
    window_handle: int,
    payload: NativeControlRequest,
    _: dict = Depends(require_admin_session),
):
    return agent_request(
        "POST",
        f"/agent/trace/windows/{window_handle}/wait-control",
        payload.model_dump(),
        timeout=35,
    )


@app.post("/bridge/admin/trace/windows/{window_handle}/control-action")
def bridge_trace_window_control_action(
    window_handle: int,
    payload: NativeControlRequest,
    _: dict = Depends(require_admin_session),
):
    require_no_blocking_native_popup("trace_control_action")
    return agent_request(
        "POST",
        f"/agent/trace/windows/{window_handle}/control-action",
        payload.model_dump(),
        timeout=30,
    )


@app.post("/bridge/admin/automation/rtd/open")
def bridge_open_rtd_popup(payload: RtdOpenRequest, _: dict = Depends(require_admin_session)):
    return open_native_rtd_popup(payload.window_handle, payload.rtd_index, payload.timeout_seconds)


@app.post("/bridge/admin/automation/rtd/popup-action")
def bridge_rtd_popup_action(
    payload: RtdPopupActionRequest,
    _: dict = Depends(require_admin_session),
):
    return invoke_native_rtd_popup_action(payload)


@app.post("/bridge/admin/automation/rtd/select-location")
def bridge_rtd_select_location(
    payload: RtdLocationRequest,
    _: dict = Depends(require_admin_session),
):
    return select_native_rtd_location(payload)


@app.post("/bridge/generic-obd/start")
def bridge_generic_obd(_: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("generic_obd_start")
    return agent_request("POST", "/agent/generic-obd/start")

@app.post("/bridge/hardware/search-vci")
def bridge_hardware_search_vci(_: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("hardware_search_vci")
    return agent_request("POST", "/agent/hardware/search-vci")

@app.post("/bridge/hardware/test-vci")
def bridge_hardware_test_vci(_: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("hardware_test_vci")
    return agent_request("POST", "/agent/hardware/test-vci")

@app.post("/bridge/ui/click-text")
def bridge_click_text(payload: ClickTextRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("click_text")
    return agent_request("POST", "/agent/ui/click-text", payload.model_dump())


@app.post("/bridge/ui/click-point")
def bridge_click_point(payload: ClickPointRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("click_point")
    return agent_request("POST", "/agent/ui/click-point", payload.model_dump())


@app.get("/bridge/autocom/product")
def autocom_product(_: bool = Depends(require_token)):
    return autocom_get("/application/product")

@app.get("/bridge/translations/{text_id}")
def translation(text_id: int, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_translation, text_id)


@app.post("/bridge/vehicles/favourites/add")
def add_favourite(payload: FavouriteRequest, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.add_favourite, payload.id)


@app.post("/bridge/vehicles/favourites/remove")
def remove_favourite(payload: FavouriteRequest, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.remove_favourite, payload.id)


@app.get("/bridge/vin/isavailable")
def vin_available(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_vin_available)


@app.get("/bridge/vin/history")
def vin_history(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_vin_history)


@app.get("/bridge/vrm/isavailable")
def vrm_available(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_vrm_available)


@app.get("/bridge/vrm/history")
def vrm_history(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_vrm_history)


@app.get("/bridge/history")
def history(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_history)


@app.post("/bridge/history/remove/{history_id}")
def remove_history(history_id: str, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.remove_history, history_id)


@app.get("/bridge/vehicles/{vehicle_definition_id}/guide")
def guide(vehicle_definition_id: str, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_guide, vehicle_definition_id)


@app.get("/bridge/vehicles/{vehicle_definition_id}/capabilities")
def capabilities(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_capabilities, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{vehicle_definition_id}/obd-functions")
def obd_functions(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_obd_functions, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{vehicle_definition_id}/rtd-functions")
def rtd_functions(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.get_rtd_functions, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{list_type}")
def vehicle_selection_root(list_type: str, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(list_type)
    return diagnostic_engine_call(rest_client.get_vehicle_selection, valid_type, "")


@app.get("/bridge/vehicles/{list_type}/{vehicle_id}")
def vehicle_selection(list_type: str, vehicle_id: str, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(list_type)
    return diagnostic_engine_call(rest_client.get_vehicle_selection, valid_type, vehicle_id)


@app.post("/bridge/vehicles/select")
def vehicle_selection_post(payload: VehicleSelectionRequest, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(payload.list_type)
    return diagnostic_engine_call(rest_client.get_vehicle_selection, valid_type, payload.vehicle_id)


@app.post("/bridge/mobile/vehicles/activate")
def mobile_activate_vehicle_context(payload: VehicleContextRequest, client: dict = Depends(require_paired_client)):
    require_no_blocking_native_popup("activate_vehicle_context")
    vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
    sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
    diagnostic_log.info(
        "Mobile vehicle context activated client_id=%s vehicle_definition_id=%s",
        client["client_id"],
        vehicle_definition_id,
    )
    record_activity_safely(
        level="success",
        source="mobile-portal",
        action="activate_vehicle_context",
        client=client["client_id"],
        request={"vehicle_definition_id": vehicle_definition_id},
    )
    return {
        "active_vehicle_definition_id": vehicle_definition_id,
        "sent": sent,
    }


@app.get("/bridge/mobile/vin/isavailable")
def mobile_vin_available(_: dict = Depends(require_paired_client)):
    return diagnostic_engine_call(rest_client.get_vin_available)


@app.get("/bridge/mobile/vin/history")
def mobile_vin_history(_: dict = Depends(require_paired_client)):
    return diagnostic_engine_call(rest_client.get_vin_history)


@app.post("/bridge/mobile/vin/select")
def mobile_select_vin(payload: VinSelectionRequest, client: dict = Depends(require_paired_client)):
    require_no_blocking_native_popup("select_vehicle_by_vin")
    formatted_vin = normalize_vin(payload.vin)
    sent = safe_call(signalr_client.send, "setVin", formatted_vin)
    record_activity_safely(
        level="success",
        source="mobile-portal",
        action="select_vehicle_by_vin",
        client=client["client_id"],
        request={"vin_length": len("".join(formatted_vin.split()))},
    )
    return {"vin": formatted_vin, "sent": sent}


@app.post("/bridge/mobile/vin/read")
def mobile_read_vin(client: dict = Depends(require_paired_client)):
    require_no_blocking_native_popup("read_vin_from_vehicle")
    sent = safe_call(signalr_client.send, "runVinCheck")
    record_activity_safely(
        level="success",
        source="mobile-portal",
        action="read_vin_from_vehicle",
        client=client["client_id"],
    )
    return sent


@app.post("/bridge/mobile/vehicles/rtd/open")
def mobile_open_vehicle_rtd(payload: RtdFunctionOpenRequest, client: dict = Depends(require_paired_client)):
    request_log = payload.model_dump()
    try:
        vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
        selected_function = require_rtd_function(vehicle_definition_id, payload.rtd_index, payload.protocol)
        source_window_handle = find_engine_window_handle()
        existing_popup = active_native_blocking_popup()
        if existing_popup.get("popup_open"):
            selection_sent = None
            popup_result = native_popup_contract(existing_popup, sent=None, command_sent=False)
            popup_result["already_open"] = True
            popup_result["warning"] = (
                "A native popup is already blocking the desktop. "
                "The requested RTD item was not launched; handle the current popup first."
            )
        else:
            selection_sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
            popup_result = open_native_rtd_popup(source_window_handle, payload.rtd_index, payload.timeout_seconds)
        result = {
            "active_vehicle_definition_id": vehicle_definition_id,
            "rtd_function": selected_function,
            "selection_sent": selection_sent,
            "source_window_handle": source_window_handle,
            **popup_result,
        }
    except HTTPException as exc:
        system_message = (
            "RTD popup workflow failed after the RTD row was selected. "
            "The submitted payload, returned error and downstream Desktop Agent diagnostics are retained."
        )
        record_activity_safely(
            level="error",
            source="mobile-portal",
            action="open_rtd_native_popup_failed",
            client=client["client_id"],
            method="POST",
            path="/bridge/mobile/vehicles/rtd/open",
            status_code=exc.status_code,
            request=request_log,
            response={"detail": exc.detail},
            error=system_message,
            system_log={"logger": "bridge-diagnostics.log", "message": system_message},
        )
        raise

    unconfirmed = not bool(result.get("confirmed"))
    reused = bool(result.get("already_open"))
    log_level = "warning" if unconfirmed or reused else "success"
    log_action = "open_rtd_native_popup_warning" if log_level == "warning" else "open_rtd_native_popup"
    response_log = {
        "confirmed": result.get("confirmed"),
        "run_button_confirmed": result.get("run_button_confirmed"),
        "warning": result.get("warning"),
        "detection_method": result.get("detection_method"),
        "available_actions": result.get("available_actions"),
        "location_count": len(result.get("locations", [])),
        "popup_signature": (result.get("popup_identity") or {}).get("signature"),
        "popup_window_handle": result.get("popup_window_handle"),
    }
    if unconfirmed:
        screen = result.get("screen") if isinstance(result.get("screen"), dict) else {}
        response_log["window_transition"] = screen.get("window_transition")
        response_log["observed_windows"] = screen.get("observed_windows")
        diagnostic_log.warning(
            "RTD popup detected without stable action controls client_id=%s request=%s response=%s",
            client["client_id"],
            request_log,
            response_log,
        )
    record_activity_safely(
        level=log_level,
        source="mobile-portal",
        action=log_action,
        client=client["client_id"],
        method="POST",
        path="/bridge/mobile/vehicles/rtd/open",
        status_code=200,
        request=request_log,
        response=response_log,
        system_log={
            "logger": "bridge-diagnostics.log",
            "message": result.get("warning") or "Native RTD popup control signature confirmed.",
        },
    )
    return result


@app.get("/bridge/mobile/automation/blocking-popup")
def mobile_blocking_popup_state(_: dict = Depends(require_paired_client)):
    return native_popup_contract(active_native_blocking_popup(), command_sent=False)


@app.post("/bridge/mobile/automation/rtd/popup-action")
def mobile_rtd_popup_action(
    payload: RtdPopupActionRequest,
    client: dict = Depends(require_paired_client),
):
    request_log = payload.model_dump()
    try:
        result = invoke_native_rtd_popup_action(payload)
    except HTTPException as exc:
        system_message = "Native RTD popup action failed; request and Desktop Agent response are retained."
        record_activity_safely(
            level="error",
            source="mobile-portal",
            action="rtd_popup_action_failed",
            client=client["client_id"],
            method="POST",
            path="/bridge/mobile/automation/rtd/popup-action",
            status_code=exc.status_code,
            request=request_log,
            response={"detail": exc.detail},
            error=system_message,
            system_log={"logger": "bridge-diagnostics.log", "message": system_message},
        )
        raise
    record_activity_safely(
        level="success",
        source="mobile-portal",
        action="rtd_popup_action",
        client=client["client_id"],
        request=request_log,
        response=result,
    )
    return result


@app.post("/bridge/mobile/automation/rtd/select-location")
def mobile_rtd_select_location(
    payload: RtdLocationRequest,
    client: dict = Depends(require_paired_client),
):
    request_log = payload.model_dump()
    try:
        result = select_native_rtd_location(payload)
    except HTTPException as exc:
        system_message = "Native RTD location selection failed; request and Desktop Agent response are retained."
        record_activity_safely(
            level="error",
            source="mobile-portal",
            action="rtd_popup_location_failed",
            client=client["client_id"],
            method="POST",
            path="/bridge/mobile/automation/rtd/select-location",
            status_code=exc.status_code,
            request=request_log,
            response={"detail": exc.detail},
            error=system_message,
            system_log={"logger": "bridge-diagnostics.log", "message": system_message},
        )
        raise
    record_activity_safely(
        level="success",
        source="mobile-portal",
        action="rtd_popup_location_selected",
        client=client["client_id"],
        request=request_log,
        response=result,
    )
    return result


@app.post("/bridge/admin/vehicles/activate")
def admin_activate_vehicle_context(payload: VehicleContextRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("admin_activate_vehicle_context")
    vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
    sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
    return {
        "active_vehicle_definition_id": vehicle_definition_id,
        "sent": sent,
    }


@app.post("/bridge/admin/vehicles/rtd/open")
def admin_open_vehicle_rtd(payload: RtdFunctionOpenRequest, _: dict = Depends(require_admin_session)):
    vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
    selected_function = require_rtd_function(vehicle_definition_id, payload.rtd_index, payload.protocol)
    source_window_handle = find_engine_window_handle()
    existing_popup = active_native_blocking_popup()
    if existing_popup.get("popup_open"):
        selection_sent = None
        popup_result = native_popup_contract(existing_popup, sent=None, command_sent=False)
        popup_result["already_open"] = True
        popup_result["warning"] = (
            "A native popup is already blocking the desktop. "
            "The requested RTD item was not launched; handle the current popup first."
        )
    else:
        selection_sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
        popup_result = open_native_rtd_popup(source_window_handle, payload.rtd_index, payload.timeout_seconds)
    return {
        "active_vehicle_definition_id": vehicle_definition_id,
        "rtd_function": selected_function,
        "selection_sent": selection_sent,
        "source_window_handle": source_window_handle,
        **popup_result,
    }


@app.post("/bridge/admin/vin/select")
def admin_select_vin(payload: VinSelectionRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("admin_select_vehicle_by_vin")
    formatted_vin = normalize_vin(payload.vin)
    sent = safe_call(signalr_client.send, "setVin", formatted_vin)
    return {
        "vin": formatted_vin,
        "sent": sent,
    }


@app.post("/bridge/admin/vin/read")
def admin_read_vin(_: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("admin_read_vin_from_vehicle")
    return safe_call(signalr_client.send, "runVinCheck")


@app.get("/bridge/limitations/can-erase-faultcodes")
def can_erase_faultcodes(_: bool = Depends(require_token)):
    return diagnostic_engine_call(rest_client.can_erase_faultcodes)


@app.post("/bridge/signalr/connect")
def signalr_connect(_: dict = Depends(require_admin_session)):
    return safe_call(signalr_client.connect)


@app.post("/bridge/signalr/disconnect")
def signalr_disconnect(_: dict = Depends(require_admin_session)):
    return safe_call(signalr_client.disconnect)


@app.get("/bridge/signalr/status")
def signalr_status(_: dict = Depends(require_admin_session)):
    return signalr_client.status()


@app.post("/bridge/signalr/send")
def signalr_send(payload: SignalRSendRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("signalr_send")
    return safe_call(signalr_client.send, payload.event, payload.data)


@app.post("/bridge/diagnostics/run")
def run_diagnosis(payload: RunDiagnosisRequest, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("run_diagnosis")
    return safe_call(
        signalr_client.send_run_diagnosis,
        payload.function_name,
        payload.vehicle_ids,
        payload.protocol,
        payload.data,
    )


@app.websocket("/bridge/diagnostics/events")
async def diagnostics_events(websocket: WebSocket, token: str | None = None):
    admin_cookie = websocket.cookies.get(settings.admin_session_cookie_name)
    local_admin_session = validate_admin_session(
        admin_cookie,
        require_csrf=False,
    )
    paired_mobile_client = verify_client_token(token or "")

    if not local_admin_session and not paired_mobile_client:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    signalr_client.connect()

    try:
        while True:
            event = await asyncio.to_thread(signalr_client.wait_event, 0.5)
            if event is not None:
                await websocket.send_json({
                    "event": event.event,
                    "data": event.data,
                })
            else:
                await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return

@app.get("/bridge/admin/health")
def bridge_admin_health(_: dict = Depends(require_admin_session)):
    agent_status = None
    agent_error = None

    try:
        agent_status = agent_request("GET", "/agent/status", timeout=3)
    except HTTPException as exc:
        agent_error = exc.detail

    native_api_status = rest_client.health()
    native_api_reachable = bool(native_api_status.get("ok"))
    native_api_error = None if native_api_reachable else native_api_status.get("error")
    if not native_api_reachable:
        diagnostic_log.warning(
            "Health check: local API unavailable endpoint=%s error=%s",
            settings.autocom_api_base,
            native_api_error,
        )

    active_clients = [
        client for client in list_clients()
        if not client.get("revoked")
    ]

    window = (agent_status or {}).get("window") or {}
    engine_detected = bool(window.get("found"))
    agent_running = agent_status is not None and agent_error is None
    engine_ready = engine_detected and native_api_reachable

    if not agent_running or not native_api_reachable:
        overall = "blocked"
    elif not engine_detected or not active_clients:
        overall = "attention"
    else:
        overall = "healthy"

    if not native_api_reachable:
        engine_status = "blocked"
        engine_message = (
            "Diagnostic Engine Console local API is not listening at "
            f"{settings.autocom_api_base}. Start the configured engine and retry."
        )
    elif not engine_detected:
        engine_status = "attention"
        engine_message = "Open or configure an engine target."
    else:
        engine_status = "healthy"
        engine_message = "Configured engine and local API detected."

    return {
        "overall": overall,
        "bridge": {
            "status": "healthy",
            "message": "Bridge service is running.",
        },
        "desktop_agent": {
            "status": "healthy" if agent_running else "blocked",
            "message": (
                "Desktop agent is reachable."
                if agent_running
                else (
                    "Desktop agent is unavailable. Check scheduled task "
                    "DiagnosticEngineConsoleDesktopAgent and "
                    f"{settings.agent_log_dir / 'desktop-agent.err.log'}."
                )
            ),
        },
        "engine": {
            "status": engine_status,
            "detected": engine_detected,
            "ready": engine_ready,
            "engine_label": window.get("engine_label"),
            "local_api_reachable": native_api_reachable,
            "local_api_endpoint": settings.autocom_api_base,
            "local_api_error": native_api_error,
            "message": engine_message,
        },
        "mobile_pairing": {
            "status": "healthy" if active_clients else "attention",
            "active_devices": len(active_clients),
            "message": "Mobile device paired." if active_clients else "No active mobile device is paired.",
        },
        "hardware": {
            "status": "attention",
            "verification": "pending",
            "message": "VCI and real-vehicle diagnostic validation must be completed with physical hardware.",
        },
    }

@app.get("/bridge/admin/engine-profiles")
def bridge_engine_profiles(_: dict = Depends(require_admin_session)):
    return {"profiles": list_engine_profiles()}


@app.put("/bridge/admin/engine-profiles/{module}")
def bridge_save_engine_profile(
    module: str,
    payload: EngineProfileRequest,
    _: dict = Depends(require_admin_session),
):
    try:
        return save_engine_profile(module, payload.shortcut_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": str(exc), "message": "Unable to save engine configuration."},
        )


@app.post("/bridge/admin/engine-profiles/{module}/launch")
def bridge_launch_engine(module: str, _: dict = Depends(require_admin_session)):
    require_no_blocking_native_popup("launch_engine")
    profile = next(
        (profile for profile in list_engine_profiles() if profile["module"] == module),
        None,
    )
    if not profile or not profile["configured"]:
        raise HTTPException(
            status_code=400,
            detail={"code": "ENGINE_NOT_CONFIGURED", "message": "Configure this engine first."},
        )

    return agent_request(
        "POST",
        "/agent/engine/launch",
        {
            "module": module,
            "label": ENGINE_LABELS[module],
            "shortcut_path": profile["shortcut_path"],
        },
    )

@app.get("/bridge/pairing/{pairing_id}/status")
def bridge_pairing_status(
    pairing_id: str,
    _: dict = Depends(require_admin_session),
):
    return get_pairing_status(pairing_id)
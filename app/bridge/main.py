import asyncio
import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, Security, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.autocom.rest_client import AutocomRestClient
from app.autocom.signalr_legacy import ClassicSignalRClient
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
from app.device.clients import list_clients, revoke_client, verify_client_token
from app.device.identity import public_identity
from app.device.pairing import claim_pairing, get_pairing_status, start_pairing
from app.security.admin_auth import (
    create_admin_session,
    get_or_create_admin_secret,
    revoke_admin_session,
    validate_admin_session,
)
from app.settings import ensure_runtime_dirs, settings
from app.engine.profiles import ENGINE_LABELS, list_engine_profiles, save_engine_profile


ensure_runtime_dirs()
get_or_create_admin_secret()

rest_client = AutocomRestClient()
signalr_client = ClassicSignalRClient()

app = FastAPI(
    title="Diagnostic Bridge Service",
    version="0.1.0",
    description="Local diagnostic bridge service and desktop automation gateway.",
)

bridge_auth_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="PairedDeviceBearerAuth",
    description="Bearer token issued only to a paired mobile client.",
)

admin_assets_dir = settings.web_admin_dist_dir / "assets"
if admin_assets_dir.exists():
    app.mount(
        "/admin/assets",
        StaticFiles(directory=str(admin_assets_dir)),
        name="admin-assets",
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

    if not validate_admin_session(cookie_value, x_csrf_token, require_csrf=True):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_ADMIN_SESSION",
                "message": "Local Admin Console session is missing or expired.",
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
    if validate_admin_session(admin_cookie, x_csrf_token, require_csrf=True):
        return {"type": "admin"}

    supplied_token = extract_bearer_token(credentials, authorization)

    client = verify_client_token(supplied_token or "")
    if client:
        return {"type": "client", "client": client}

    raise HTTPException(
        status_code=401,
        detail={
            "code": "INVALID_BRIDGE_TOKEN",
            "message": "Invalid local admin session or paired-device token.",
            "expected_header": "Authorization: Bearer <paired-device-token>",
        },
    )

def safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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

        raise HTTPException(
            status_code=response.status_code if response is not None else 502,
            detail=detail,
        )
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Desktop Agent request failed: {exc}",
        )


def autocom_get(path: str):
    url = settings.autocom_api_base + path
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Autocom local API request failed: {exc}",
        )

@app.get("/bridge/public/identity")
def bridge_public_identity():
    return public_identity()

@app.post("/bridge/admin/session")
def bridge_admin_session(response: Response, request: Request):
    require_loopback(request)
    session = create_admin_session()
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=session["cookie_value"],
        httponly=True,
        samesite="strict",
        secure=False,
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
def bridge_pairing_claim(payload: PairingClaimRequest):
    try:
        return claim_pairing(
            pairing_id=payload.pairing_id,
            pairing_secret=payload.pairing_secret,
            client_name=payload.client_name,
            client_type=payload.client_type,
        )
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


@app.get("/bridge/clients")
def bridge_clients(_: dict = Depends(require_admin_session)):
    return {"clients": list_clients()}


@app.post("/bridge/clients/{client_id}/revoke")
def bridge_revoke_client(client_id: str, _: dict = Depends(require_admin_session)):
    revoked = revoke_client(client_id)
    if not revoked:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CLIENT_NOT_FOUND",
                "message": "Paired client was not found.",
            },
        )
    return {"revoked": True, "client": revoked}



@app.get("/bridge/status")
def bridge_status(_: bool = Depends(require_token)):
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
def bridge_agent_status(_: bool = Depends(require_token)):
    return agent_request("GET", "/agent/status")


@app.get("/bridge/screen/texts")
def bridge_screen_texts(_: bool = Depends(require_token)):
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
    return agent_request(
        "POST",
        f"/agent/trace/windows/{window_handle}/control-action",
        payload.model_dump(),
        timeout=30,
    )


@app.post("/bridge/admin/automation/rtd/open")
def bridge_open_rtd_popup(payload: RtdOpenRequest, _: dict = Depends(require_admin_session)):
    sent = safe_call(signalr_client.send, "viewRTDHelpDocument", payload.rtd_index)

    # The RTD form is opened as its own native top-level window. Locate the
    # window created by the source engine process instead of searching only
    # beneath the original main-window HWND.
    popup_screen = agent_request(
        "POST",
        "/agent/trace/find-window-control",
        {
            "source_window_handle": payload.window_handle,
            "same_process": True,
            "automation_id": "FormOBDFunction",
            "control_type": "Window",
            "present": True,
            "timeout_seconds": payload.timeout_seconds,
        },
        timeout=35,
    )
    popup_window_handle = popup_screen["window"]["handle"]
    run_screen = agent_request(
        "POST",
        f"/agent/trace/windows/{popup_window_handle}/wait-control",
        {
            "automation_id": "autocomButtonPlay",
            "control_type": "Button",
            "parent_automation_id": "FormOBDFunction",
            "present": True,
            "timeout_seconds": payload.timeout_seconds,
        },
        timeout=35,
    )

    return {
        "sent": sent,
        "confirmed": True,
        "confirmation": "Native RTD popup and Run button were detected through UI Automation.",
        "popup_window_handle": popup_window_handle,
        "popup": popup_screen["matched_control"],
        "run_button": run_screen["matched_control"],
        "screen": run_screen,
    }


@app.post("/bridge/admin/automation/rtd/popup-action")
def bridge_rtd_popup_action(
    payload: RtdPopupActionRequest,
    _: dict = Depends(require_admin_session),
):
    button_ids = {
        "run": "autocomButtonPlay",
        "select_vehicle": "autocomButtonNavigate",
        "help": "autocomButtonHelp",
        "cancel": "buttonClose",
    }
    automation_id = button_ids.get(payload.action)
    if automation_id is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_RTD_POPUP_ACTION",
                "message": "Unsupported RTD popup action.",
            },
        )

    return agent_request(
        "POST",
        f"/agent/trace/windows/{payload.window_handle}/control-action",
        {
            "automation_id": automation_id,
            "control_type": "Button",
            "parent_automation_id": "FormOBDFunction",
            "action": "invoke",
            "fallback_window_handle": payload.fallback_window_handle,
        },
        timeout=30,
    )


@app.post("/bridge/admin/automation/rtd/select-location")
def bridge_rtd_select_location(
    payload: RtdLocationRequest,
    _: dict = Depends(require_admin_session),
):
    return agent_request(
        "POST",
        f"/agent/trace/windows/{payload.window_handle}/control-action",
        {
            "text": payload.location_text.strip(),
            "control_type": "ListItem",
            "parent_automation_id": "listBoxLocations",
            "action": "select",
            "fallback_window_handle": payload.fallback_window_handle,
        },
        timeout=30,
    )


@app.post("/bridge/generic-obd/start")
def bridge_generic_obd(_: bool = Depends(require_token)):
    return agent_request("POST", "/agent/generic-obd/start")

@app.post("/bridge/hardware/search-vci")
def bridge_hardware_search_vci(_: bool = Depends(require_token)):
    return agent_request("POST", "/agent/hardware/search-vci")

@app.post("/bridge/hardware/test-vci")
def bridge_hardware_test_vci(_: bool = Depends(require_token)):
    return agent_request("POST", "/agent/hardware/test-vci")

@app.post("/bridge/ui/click-text")
def bridge_click_text(payload: ClickTextRequest, _: bool = Depends(require_token)):
    return agent_request("POST", "/agent/ui/click-text", payload.model_dump())


@app.post("/bridge/ui/click-point")
def bridge_click_point(payload: ClickPointRequest, _: bool = Depends(require_token)):
    return agent_request("POST", "/agent/ui/click-point", payload.model_dump())


@app.get("/bridge/autocom/product")
def autocom_product(_: bool = Depends(require_token)):
    return autocom_get("/application/product")

@app.get("/bridge/translations/{text_id}")
def translation(text_id: int, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_translation, text_id)


@app.post("/bridge/vehicles/favourites/add")
def add_favourite(payload: FavouriteRequest, _: bool = Depends(require_token)):
    return safe_call(rest_client.add_favourite, payload.id)


@app.post("/bridge/vehicles/favourites/remove")
def remove_favourite(payload: FavouriteRequest, _: bool = Depends(require_token)):
    return safe_call(rest_client.remove_favourite, payload.id)


@app.get("/bridge/vin/isavailable")
def vin_available(_: bool = Depends(require_token)):
    return safe_call(rest_client.get_vin_available)


@app.get("/bridge/vin/history")
def vin_history(_: bool = Depends(require_token)):
    return safe_call(rest_client.get_vin_history)


@app.get("/bridge/vrm/isavailable")
def vrm_available(_: bool = Depends(require_token)):
    return safe_call(rest_client.get_vrm_available)


@app.get("/bridge/vrm/history")
def vrm_history(_: bool = Depends(require_token)):
    return safe_call(rest_client.get_vrm_history)


@app.get("/bridge/history")
def history(_: bool = Depends(require_token)):
    return safe_call(rest_client.get_history)


@app.post("/bridge/history/remove/{history_id}")
def remove_history(history_id: str, _: bool = Depends(require_token)):
    return safe_call(rest_client.remove_history, history_id)


@app.get("/bridge/vehicles/{vehicle_definition_id}/guide")
def guide(vehicle_definition_id: str, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_guide, vehicle_definition_id)


@app.get("/bridge/vehicles/{vehicle_definition_id}/capabilities")
def capabilities(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_capabilities, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{vehicle_definition_id}/obd-functions")
def obd_functions(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_obd_functions, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{vehicle_definition_id}/rtd-functions")
def rtd_functions(vehicle_definition_id: str, protocol: str | None = None, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_rtd_functions, vehicle_definition_id, protocol)


@app.get("/bridge/vehicles/{list_type}")
def vehicle_selection_root(list_type: str, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(list_type)
    return safe_call(rest_client.get_vehicle_selection, valid_type, "")


@app.get("/bridge/vehicles/{list_type}/{vehicle_id}")
def vehicle_selection(list_type: str, vehicle_id: str, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(list_type)
    return safe_call(rest_client.get_vehicle_selection, valid_type, vehicle_id)


@app.post("/bridge/vehicles/select")
def vehicle_selection_post(payload: VehicleSelectionRequest, _: bool = Depends(require_token)):
    valid_type = require_vehicle_list_type(payload.list_type)
    return safe_call(rest_client.get_vehicle_selection, valid_type, payload.vehicle_id)


@app.post("/bridge/admin/vehicles/activate")
def admin_activate_vehicle_context(payload: VehicleContextRequest, _: dict = Depends(require_admin_session)):
    vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
    sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
    return {
        "active_vehicle_definition_id": vehicle_definition_id,
        "sent": sent,
    }


@app.post("/bridge/admin/vehicles/rtd/open")
def admin_open_vehicle_rtd(payload: RtdFunctionOpenRequest, _: dict = Depends(require_admin_session)):
    vehicle_definition_id = require_vehicle_definition_id(payload.vehicle_definition_id)
    selection_sent = safe_call(signalr_client.send, "carSelectionChanged", vehicle_definition_id)
    functions = safe_call(rest_client.get_rtd_functions, vehicle_definition_id, payload.protocol)

    if not isinstance(functions, list):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RTD_FUNCTION_LIST_UNAVAILABLE",
                "message": "Autocom did not return an RTD function list for the active vehicle context.",
            },
        )

    selected_function = next(
        (
            item for item in functions
            if isinstance(item, dict) and str(item.get("index")) == str(payload.rtd_index)
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

    popup_sent = safe_call(signalr_client.send, "viewRTDHelpDocument", payload.rtd_index)
    return {
        "active_vehicle_definition_id": vehicle_definition_id,
        "rtd_function": selected_function,
        "selection_sent": selection_sent,
        "popup_sent": popup_sent,
    }


@app.post("/bridge/admin/vin/select")
def admin_select_vin(payload: VinSelectionRequest, _: dict = Depends(require_admin_session)):
    formatted_vin = normalize_vin(payload.vin)
    sent = safe_call(signalr_client.send, "setVin", formatted_vin)
    return {
        "vin": formatted_vin,
        "sent": sent,
    }


@app.post("/bridge/admin/vin/read")
def admin_read_vin(_: dict = Depends(require_admin_session)):
    return safe_call(signalr_client.send, "runVinCheck")


@app.get("/bridge/limitations/can-erase-faultcodes")
def can_erase_faultcodes(_: bool = Depends(require_token)):
    return safe_call(rest_client.can_erase_faultcodes)


@app.post("/bridge/signalr/connect")
def signalr_connect(_: bool = Depends(require_token)):
    return safe_call(signalr_client.connect)


@app.post("/bridge/signalr/disconnect")
def signalr_disconnect(_: bool = Depends(require_token)):
    return safe_call(signalr_client.disconnect)


@app.get("/bridge/signalr/status")
def signalr_status(_: bool = Depends(require_token)):
    return signalr_client.status()


@app.post("/bridge/signalr/send")
def signalr_send(payload: SignalRSendRequest, _: bool = Depends(require_token)):
    return safe_call(signalr_client.send, payload.event, payload.data)


@app.post("/bridge/diagnostics/run")
def run_diagnosis(payload: RunDiagnosisRequest, _: bool = Depends(require_token)):
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

    active_clients = [
        client for client in list_clients()
        if not client.get("revoked")
    ]

    window = (agent_status or {}).get("window") or {}
    engine_detected = bool(window.get("found"))
    agent_running = agent_status is not None and agent_error is None

    if not agent_running:
        overall = "blocked"
    elif not engine_detected or not active_clients:
        overall = "attention"
    else:
        overall = "healthy"

    return {
        "overall": overall,
        "bridge": {
            "status": "healthy",
            "message": "Bridge service is running.",
        },
        "desktop_agent": {
            "status": "healthy" if agent_running else "blocked",
            "message": "Desktop agent is reachable." if agent_running else "Desktop agent is unavailable.",
        },
        "engine": {
            "status": "healthy" if engine_detected else "attention",
            "detected": engine_detected,
            "engine_label": window.get("engine_label"),
            "message": "Configured engine detected." if engine_detected else "Open or configure an engine target.",
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
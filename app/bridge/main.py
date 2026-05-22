import asyncio
import hmac

import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Security, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.autocom.rest_client import AutocomRestClient
from app.autocom.signalr_legacy import ClassicSignalRClient
from app.bridge.schemas import (
    FavouriteRequest,
    PairingClaimRequest,
    RunDiagnosisRequest,
    SignalRSendRequest,
    VehicleSelectionRequest,
)
from app.device.clients import list_clients, revoke_client, verify_client_token
from app.device.identity import public_identity
from app.device.pairing import claim_pairing, start_pairing
from app.settings import ensure_runtime_dirs, settings


ensure_runtime_dirs()

rest_client = AutocomRestClient()
signalr_client = ClassicSignalRClient()

app = FastAPI(
    title="Autocom Bridge Server",
    version="0.1.0",
    description="LAN bridge server. API/SignalR first, Desktop Agent for automation.",
    swagger_ui_parameters={
        "persistAuthorization": True,
    },
)

bridge_auth_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="BridgeBearerAuth",
    description="Paste only the bridge API token, for example: change-me-dev-token",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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


def is_admin_token(token: str | None) -> bool:
    if not settings.api_token:
        return True
    return bool(token) and hmac.compare_digest(token, settings.api_token)


def require_admin_token(
    credentials: HTTPAuthorizationCredentials | None = Security(bridge_auth_scheme),
    authorization: str | None = Header(default=None, include_in_schema=False),
):
    supplied_token = extract_bearer_token(credentials, authorization)

    if not is_admin_token(supplied_token):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_BRIDGE_ADMIN_TOKEN",
                "message": "Invalid or missing bridge admin token.",
                "expected_header": "Authorization: Bearer <admin-token>",
            },
        )

    return {"type": "admin"}


def require_token(
    credentials: HTTPAuthorizationCredentials | None = Security(bridge_auth_scheme),
    authorization: str | None = Header(default=None, include_in_schema=False),
):
    supplied_token = extract_bearer_token(credentials, authorization)

    if is_admin_token(supplied_token):
        return {"type": "admin"}

    client = verify_client_token(supplied_token or "")
    if client:
        return {"type": "client", "client": client}

    raise HTTPException(
        status_code=401,
        detail={
            "code": "INVALID_BRIDGE_TOKEN",
            "message": "Invalid or missing bridge token.",
            "expected_header": "Authorization: Bearer <admin-or-client-token>",
        },
    )

def safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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


@app.post("/bridge/pairing/start")
def bridge_pairing_start(_: dict = Depends(require_admin_token)):
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
def bridge_clients(_: dict = Depends(require_admin_token)):
    return {"clients": list_clients()}


@app.post("/bridge/clients/{client_id}/revoke")
def bridge_revoke_client(client_id: str, _: dict = Depends(require_admin_token)):
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
    return autocom_get(f"/vehicleselection/{list_type}/")


@app.get("/bridge/vehicles/{list_type}/{vehicle_id}")
def vehicle_selection(list_type: str, vehicle_id: str, _: bool = Depends(require_token)):
    return autocom_get(f"/vehicleselection/{list_type}/{vehicle_id}")


@app.post("/bridge/vehicles/select")
def vehicle_selection_post(payload: VehicleSelectionRequest, _: bool = Depends(require_token)):
    return safe_call(rest_client.get_vehicle_selection, payload.list_type, payload.vehicle_id)


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
    if settings.api_token and not is_admin_token(token) and not verify_client_token(token or ""):
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
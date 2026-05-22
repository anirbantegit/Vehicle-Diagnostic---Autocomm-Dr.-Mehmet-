from typing import Any

from pydantic import BaseModel, Field


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

class EngineProfileRequest(BaseModel):
    shortcut_path: str

class EngineLaunchRequest(BaseModel):
    module: str
    label: str
    shortcut_path: str

class VehicleSelectionRequest(BaseModel):
    list_type: str
    vehicle_id: str = ""


class RunDiagnosisRequest(BaseModel):
    function_name: str
    vehicle_ids: list[str]
    protocol: str | None = None
    data: Any = None


class SignalRSendRequest(BaseModel):
    event: str
    data: Any = None


class FavouriteRequest(BaseModel):
    id: str


class PairingClaimRequest(BaseModel):
    pairing_id: str
    pairing_secret: str
    client_name: str
    client_type: str = "mobile_app"
import requests

from app.config import AUTOCOM_API_BASE


class AutocomRestClient:
    """
    Thin REST wrapper around the local Autocom backend used by the Angular frontend.
    This bridge keeps the original Autocom backend local and exposes controlled APIs to LAN clients.
    """

    def __init__(self, api_base: str = AUTOCOM_API_BASE, timeout: int = 10):
        self.api_base = api_base.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return self.api_base + path

    def get(self, path: str):
        response = self.session.get(self._url(path), timeout=self.timeout)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def post(self, path: str, payload=None):
        response = self.session.post(self._url(path), json=payload, timeout=self.timeout)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def health(self):
        try:
            product = self.get("/application/product")
            return {"ok": True, "product": product}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_translation(self, text_id: int):
        return self.get(f"/texts/get/{text_id}")

    def get_vehicle_selection(self, list_type: str, vehicle_id: str = ""):
        # Examples:
        # /vehicleselection/brands/
        # /vehicleselection/models/{brandId}
        vehicle_id = vehicle_id or ""
        return self.get(f"/vehicleselection/{list_type}/{vehicle_id}")

    def add_favourite(self, item_id: str):
        return self.post("/vehicleselection/favourites/add", {"id": item_id})

    def remove_favourite(self, item_id: str):
        return self.post("/vehicleselection/favourites/remove", {"id": item_id})

    def get_vin_available(self):
        return self.get("/vin/isavailable")

    def get_vin_history(self):
        return self.get("/vin/history")

    def get_vrm_available(self):
        return self.get("/vrm/isavailable")

    def get_vrm_history(self):
        return self.get("/vrm/history")

    def get_history(self):
        return self.get("/history")

    def remove_history(self, history_id: str):
        return self.post(f"/history/remove/{history_id}")

    def get_guide(self, vehicle_definition_id: str):
        return self.get(f"/guides/guide/{vehicle_definition_id}")

    def get_capabilities(self, vehicle_definition_id: str, protocol: str | None = None):
        path = f"/diagnostics/capabilities/{vehicle_definition_id}"
        if protocol:
            path += f"/{protocol}"
        return self.get(path)

    def get_obd_functions(self, vehicle_definition_id: str, protocol: str | None = None):
        path = f"/diagnostics/obdfunctions/{vehicle_definition_id}"
        if protocol:
            path += f"/{protocol}"
        return self.get(path)

    def get_rtd_functions(self, vehicle_definition_id: str, protocol: str | None = None):
        path = f"/diagnostics/rtds/{vehicle_definition_id}"
        if protocol:
            path += f"/{protocol}"
        return self.get(path)

    def can_erase_faultcodes(self):
        return self.get("/limitations/can-erase-faultcodes")
import json
import queue
import threading
import time
from dataclasses import dataclass
from urllib.parse import quote

import requests
import websocket

from app.config import AUTOCOM_SIGNALR_BASE


@dataclass
class SignalREvent:
    event: str
    data: object
    raw: object


class ClassicSignalRClient:
    """
    Minimal client for classic ASP.NET SignalR hub used by the Angular frontend.

    Frontend evidence:
      - rootPath: http://localhost:{port + 1}/signalr
      - hub: mainHub
      - server method invoked by client: send(event, data)
      - backend broadcast method listened by frontend: broadcast(event, data)

    This is intentionally isolated because SignalR protocol details can vary by backend version.
    """

    def __init__(
        self,
        signalr_base: str = AUTOCOM_SIGNALR_BASE,
        hub_name: str = "mainHub",
        client_protocol: str = "1.5",
    ):
        self.signalr_base = signalr_base.rstrip("/")
        self.hub_name = hub_name
        self.client_protocol = client_protocol
        self.session = requests.Session()
        self.ws_app = None
        self.thread = None
        self.started = False
        self.connected = False
        self.connection_token = None
        self.connection_id = None
        self.message_id = 0
        self.event_queue: queue.Queue[SignalREvent] = queue.Queue()
        self._send_lock = threading.Lock()

    @property
    def connection_data(self) -> str:
        return json.dumps([{"name": self.hub_name.lower()}], separators=(",", ":"))

    def status(self):
        return {
            "started": self.started,
            "connected": self.connected,
            "hub": self.hub_name,
            "base": self.signalr_base,
        }

    def connect(self):
        if self.started and self.connected:
            return self.status()

        if self.started and not self.connected:
            self.disconnect()

        negotiate = self._negotiate()
        self.connection_token = negotiate["ConnectionToken"]
        self.connection_id = negotiate.get("ConnectionId")

        self.ws_app = websocket.WebSocketApp(
            self._websocket_url(),
            header=self._cookie_headers(),
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )

        self.thread = threading.Thread(target=self.ws_app.run_forever, daemon=True)
        self.thread.start()
        self.started = True

        # Allow the socket to open and then call /start like the classic SignalR JS client.
        time.sleep(1)
        self._start_connection()
        return self.status()

    def disconnect(self):
        self.started = False
        self.connected = False
        if self.ws_app:
            self.ws_app.close()
        self.ws_app = None
        self.thread = None
        return self.status()

    def send(self, event: str, data=None):
        if not self.started or not self.connected:
            self.connect()

        payload = {
            "H": self.hub_name,
            "M": "send",
            "A": [event, data],
            "I": self._next_message_id(),
        }

        with self._send_lock:
            if not self.ws_app or not self.ws_app.sock or not self.ws_app.sock.connected:
                raise RuntimeError("SignalR websocket is not connected")
            self.ws_app.send(json.dumps(payload))

        return {"sent": True, "event": event}

    def send_run_diagnosis(self, function_name: str, vehicle_ids: list[str], protocol=None, data=None):
        message = {
            "functionName": function_name,
            "vehicleIds": vehicle_ids,
            "protocol": protocol,
            "data": data,
        }
        # Angular sends runDiagnosis with JSON.stringify(DiagnosticFunctionMessage)
        return self.send("runDiagnosis", json.dumps(message))

    def wait_event(self, timeout: float = 1.0) -> SignalREvent | None:
        try:
            return self.event_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def _negotiate(self):
        params = {
            "clientProtocol": self.client_protocol,
            "connectionData": self.connection_data,
            "_": str(int(time.time() * 1000)),
        }
        response = self.session.get(f"{self.signalr_base}/negotiate", params=params, timeout=10)
        response.raise_for_status()
        return response.json()

    def _start_connection(self):
        params = {
            "transport": "webSockets",
            "clientProtocol": self.client_protocol,
            "connectionToken": self.connection_token,
            "connectionData": self.connection_data,
            "_": str(int(time.time() * 1000)),
        }
        response = self.session.get(f"{self.signalr_base}/start", params=params, timeout=10)
        response.raise_for_status()
        return response.json()

    def _websocket_url(self):
        ws_base = self.signalr_base.replace("http://", "ws://").replace("https://", "wss://")
        return (
            f"{ws_base}/connect"
            f"?transport=webSockets"
            f"&clientProtocol={quote(self.client_protocol, safe='')}"
            f"&connectionToken={quote(self.connection_token, safe='')}"
            f"&connectionData={quote(self.connection_data, safe='')}"
            f"&tid=10"
        )

    def _cookie_headers(self):
        cookies = self.session.cookies.get_dict()
        if not cookies:
            return []
        cookie_value = "; ".join([f"{key}={value}" for key, value in cookies.items()])
        return [f"Cookie: {cookie_value}"]

    def _next_message_id(self):
        self.message_id += 1
        return str(self.message_id)

    def _on_open(self, ws):
        self.connected = True

    def _on_close(self, ws, close_status_code, close_msg):
        self.connected = False

    def _on_error(self, ws, error):
        self.connected = False
        self.event_queue.put(SignalREvent(
            event="signalr_error",
            data={"error": str(error)},
            raw=None,
        ))

    def _on_message(self, ws, message):
        try:
            payload = json.loads(message)
        except Exception:
            return

        for item in payload.get("M", []):
            if item.get("M") != "broadcast":
                continue

            args = item.get("A", [])
            if len(args) < 2:
                continue

            event_name = args[0]
            data = args[1]

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    pass

            self.event_queue.put(SignalREvent(
                event=event_name,
                data=data,
                raw=item,
            ))
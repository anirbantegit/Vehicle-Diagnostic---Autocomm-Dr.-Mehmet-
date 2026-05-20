export const ADMIN_TOKEN_STORAGE_KEY = 'autocom_bridge_admin_token';

export type BridgeIdentity = {
    device_id: string;
    device_name: string;
    bridge_version: string;
    bridge_port: number;
    base_url: string;
    status: string;
};

export type BridgeStatus = {
    bridge: string;
    bridge_host: string;
    bridge_port: number;
    agent_base_url: string;
    autocom_api_base: string;
    autocom_signalr_base: string;
    agent: unknown;
    agent_error: unknown;
};

export type PairingStartResponse = {
    pairing_id: string;
    pairing_secret: string;
    expires_in: number;
    expires_at: string;
    qr_payload: {
        v: number;
        type: string;
        device_id: string;
        device_name: string;
        base_url: string;
        pairing_id: string;
        pairing_secret: string;
        expires_at: string;
    };
};

export type PairedClient = {
    client_id: string;
    client_name: string;
    client_type: string;
    paired_at: string;
    last_seen_at: string | null;
    revoked: boolean;
};

export type ClientsResponse = {
    clients: PairedClient[];
};

export type SignalRSendPayload = {
    event: string;
    data?: unknown;
};

export type RunDiagnosisPayload = {
    function_name: string;
    vehicle_ids: string[];
    protocol?: string | null;
    data?: unknown;
};

export type DiagnosticCapability = {
    id?: string;
    name?: string;
    text?: string;
    title?: string;
    carSelect?: string;
    protocol?: string | null;
    disabled?: boolean;
    data?: unknown;
    fraudcheck?: boolean;
    presetEcus?: unknown[];
    [key: string]: unknown;
};

export type DiagnosticEventMessage = {
    event: string;
    data: unknown;
};

export type DiagnosticEventHandler = (message: DiagnosticEventMessage) => void;


export type VehicleListType =
    | 'brands'
    | 'models'
    | 'years'
    | 'systemTypes'
    | 'engines'
    | 'systems'
    | 'gearboxes'
    | 'equipments';

export type VehicleSelectionPayload = {
    list_type: VehicleListType;
    vehicle_id?: string;
};

export type VehicleSelectionItem = {
    id: string;
    name?: string;
    title?: string;
    icon?: string;
    favourite?: boolean;
    starred?: boolean;
    [key: string]: unknown;
};

export type VehicleSelectionResponse = {
    currentTitle?: string;
    type?: string;
    demoMode?: boolean;
    items?: VehicleSelectionItem[];
    [key: string]: unknown;
};

export function getAdminToken(): string {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
}

export function setAdminToken(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
}

export function clearAdminToken(): void {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

function buildHeaders(options?: RequestInit, authenticated = true): HeadersInit {
    const token = getAdminToken();

    return {
        'Content-Type': 'application/json',
        ...(authenticated && token ? {Authorization: `Bearer ${token}`} : {}),
        ...(options?.headers || {}),
    };
}

function parseErrorMessage(data: unknown, status: number): string {
    if (!data || typeof data !== 'object') {
        return `Bridge request failed: ${status}`;
    }

    const value = data as {
        detail?: string | { message?: string; code?: string };
        message?: string;
    };

    if (typeof value.detail === 'string') {
        return value.detail;
    }

    if (value.detail?.message) {
        return value.detail.code
            ? `${value.detail.code}: ${value.detail.message}`
            : value.detail.message;
    }

    if (value.message) {
        return value.message;
    }

    return `Bridge request failed: ${status}`;
}

export async function bridgeRequest<T>(
    path: string,
    options: RequestInit = {},
    authenticated = true,
): Promise<T> {
    const response = await fetch(path, {
        ...options,
        headers: buildHeaders(options, authenticated),
    });

    const text = await response.text();
    let data: unknown = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = {message: text || `Bridge request failed: ${response.status}`};
    }

    if (!response.ok) {
        throw new Error(parseErrorMessage(data, response.status));
    }

    return data as T;
}

export function getPublicIdentity(): Promise<BridgeIdentity> {
    return bridgeRequest<BridgeIdentity>('/bridge/public/identity', {}, false);
}

export function getBridgeStatus(): Promise<BridgeStatus> {
    return bridgeRequest<BridgeStatus>('/bridge/status');
}

export function getAgentStatus(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/agent/status');
}

export function getAutocomProduct(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/autocom/product');
}

export function getVehicleSelection(
    listType: VehicleListType,
    vehicleId = '',
): Promise<VehicleSelectionResponse> {
    const cleanVehicleId = vehicleId.trim();
    const path = cleanVehicleId
        ? `/bridge/vehicles/${listType}/${encodeURIComponent(cleanVehicleId)}`
        : `/bridge/vehicles/${listType}`;

    return bridgeRequest<VehicleSelectionResponse>(path);
}

export function postVehicleSelection(
    payload: VehicleSelectionPayload,
): Promise<VehicleSelectionResponse> {
    return bridgeRequest<VehicleSelectionResponse>('/bridge/vehicles/select', {
        method: 'POST',
        body: JSON.stringify({
            list_type: payload.list_type,
            vehicle_id: payload.vehicle_id || '',
        }),
    });
}

export function addVehicleFavourite(id: string): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/vehicles/favourites/add', {
        method: 'POST',
        body: JSON.stringify({id}),
    });
}

export function removeVehicleFavourite(id: string): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/vehicles/favourites/remove', {
        method: 'POST',
        body: JSON.stringify({id}),
    });
}

export function getVehicleGuide(vehicleDefinitionId: string): Promise<unknown> {
    return bridgeRequest<unknown>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/guide`,
    );
}

export function getVehicleCapabilities(
    vehicleDefinitionId: string,
    protocol = '',
): Promise<unknown> {
    const query = protocol.trim()
        ? `?protocol=${encodeURIComponent(protocol.trim())}`
        : '';

    return bridgeRequest<unknown>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/capabilities${query}`,
    );
}

export function getVehicleObdFunctions(
    vehicleDefinitionId: string,
    protocol = '',
): Promise<unknown> {
    const query = protocol.trim()
        ? `?protocol=${encodeURIComponent(protocol.trim())}`
        : '';

    return bridgeRequest<unknown>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/obd-functions${query}`,
    );
}

export function getVehicleRtdFunctions(
    vehicleDefinitionId: string,
    protocol = '',
): Promise<unknown> {
    const query = protocol.trim()
        ? `?protocol=${encodeURIComponent(protocol.trim())}`
        : '';

    return bridgeRequest<unknown>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/rtd-functions${query}`,
    );
}


export function getScreenTexts(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/screen/texts');
}

export function startGenericObd(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/generic-obd/start', {
        method: 'POST',
    });
}

export function searchVci(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/hardware/search-vci', {
        method: 'POST',
    });
}

export function testVci(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/hardware/test-vci', {
        method: 'POST',
    });
}

export function getSignalrStatus(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/signalr/status');
}

export function connectSignalr(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/signalr/connect', {
        method: 'POST',
    });
}

export function disconnectSignalr(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/signalr/disconnect', {
        method: 'POST',
    });
}

export function sendSignalr(payload: SignalRSendPayload): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/signalr/send', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function sendCarSelectionChanged(vehicleDefinitionId: string): Promise<unknown> {
    return sendSignalr({
        event: 'carSelectionChanged',
        data: vehicleDefinitionId,
    });
}

export function viewHelpDocument(helpDocumentId: string): Promise<unknown> {
    return sendSignalr({
        event: 'viewHelpDocument',
        data: helpDocumentId,
    });
}

export function viewRtdHelpDocument(index: number): Promise<unknown> {
    return sendSignalr({
        event: 'viewRTDHelpDocument',
        data: index,
    });
}

export function openScanReport(vehicleDefinitionId: string): Promise<unknown> {
    return sendSignalr({
        event: 'openScanReport',
        data: vehicleDefinitionId,
    });
}

export function runDiagnosis(payload: RunDiagnosisPayload): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/diagnostics/run', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function createDiagnosticsEventSocket(
    onMessage: DiagnosticEventHandler,
    onStatus?: (status: string) => void,
): WebSocket {
    const token = encodeURIComponent(getAdminToken());
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
        `${wsProtocol}//${window.location.host}/bridge/diagnostics/events?token=${token}`,
    );

    socket.onopen = () => onStatus?.('connected');
    socket.onclose = () => onStatus?.('closed');
    socket.onerror = () => onStatus?.('error');
    socket.onmessage = (event) => {
        try {
            onMessage(JSON.parse(event.data) as DiagnosticEventMessage);
        } catch {
            onMessage({
                event: 'unparsed_message',
                data: event.data,
            });
        }
    };

    return socket;
}

export function clickPoint(x: number, y: number): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/ui/click-point', {
        method: 'POST',
        body: JSON.stringify({x, y}),
    });
}

export function clickText(text: string): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/ui/click-text', {
        method: 'POST',
        body: JSON.stringify({text}),
    });
}

export function startPairing(): Promise<PairingStartResponse> {
    return bridgeRequest<PairingStartResponse>('/bridge/pairing/start', {
        method: 'POST',
    });
}

export function getClients(): Promise<ClientsResponse> {
    return bridgeRequest<ClientsResponse>('/bridge/clients');
}

export function revokeClient(clientId: string): Promise<unknown> {
    return bridgeRequest<unknown>(`/bridge/clients/${clientId}/revoke`, {
        method: 'POST',
    });
}
export const ADMIN_TOKEN_STORAGE_KEY = 'autocom_bridge_admin_token';
export const ACTION_LOG_STORAGE_KEY = 'autocom_bridge_action_logs';

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

export type UiRectInfo = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    center_x: number;
    center_y: number;
    relative_left?: number;
    relative_top?: number;
    relative_center_x?: number;
    relative_center_y?: number;
};

export type ScreenTextItem = {
    text: string;
    control_type: string;
    automation_id: string;
    class_name: string;
    rect: string;
    rect_info?: UiRectInfo;
};

export type ScreenTextsResponse = {
    timestamp: string;
    window_title: string;
    window_rect?: UiRectInfo;
    text_count: number;
    texts: ScreenTextItem[];
};

export type ActionLogEntry = {
    id: string;
    timestamp: string;
    level: 'info' | 'success' | 'error' | 'event';
    source: string;
    action: string;
    method?: string;
    path?: string;
    request?: unknown;
    response?: unknown;
    error?: string;
    duration_ms?: number;
};

const MAX_ACTION_LOGS = 300;
const MAX_LOG_PAYLOAD_CHARS = 200_000;
const actionLogListeners = new Set<(logs: ActionLogEntry[]) => void>();


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

function nowLogId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function clipForLog(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    const text = safeStringify(value);
    if (text.length <= MAX_LOG_PAYLOAD_CHARS) {
        try {
            return JSON.parse(text);
        } catch {
            return value;
        }
    }

    return {
        truncated: true,
        original_size: text.length,
        preview: text.slice(0, MAX_LOG_PAYLOAD_CHARS),
    };
}

function normalizeRequestBody(body: BodyInit | null | undefined): unknown {
    if (!body) {
        return null;
    }

    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return body;
        }
    }

    return '[non-json-body]';
}

function notifyActionLogListeners(logs: ActionLogEntry[]) {
    actionLogListeners.forEach((listener) => listener(logs));
}

export function getActionLogs(): ActionLogEntry[] {
    try {
        const raw = localStorage.getItem(ACTION_LOG_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function appendActionLog(entry: Omit<ActionLogEntry, 'id' | 'timestamp'>): ActionLogEntry {
    const nextEntry: ActionLogEntry = {
        id: nowLogId(),
        timestamp: new Date().toISOString(),
        ...entry,
        request: clipForLog(entry.request),
        response: clipForLog(entry.response),
    };

    const logs = [nextEntry, ...getActionLogs()].slice(0, MAX_ACTION_LOGS);

    try {
        localStorage.setItem(ACTION_LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch {
        localStorage.setItem(ACTION_LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, 50)));
    }

    notifyActionLogListeners(getActionLogs());
    return nextEntry;
}

export function clearActionLogs(): void {
    localStorage.removeItem(ACTION_LOG_STORAGE_KEY);
    notifyActionLogListeners([]);
}

export function subscribeActionLogs(listener: (logs: ActionLogEntry[]) => void): () => void {
    actionLogListeners.add(listener);
    return () => actionLogListeners.delete(listener);
}

export function downloadActionLogs(): void {
    const blob = new Blob([JSON.stringify(getActionLogs(), null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `autocom-bridge-debug-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
    const method = (options.method || 'GET').toUpperCase();
    const requestBody = normalizeRequestBody(options.body);
    const startedAt = performance.now();
    let response: Response;

    try {
        response = await fetch(path, {
            ...options,
            headers: buildHeaders(options, authenticated),
        });
    } catch (exc) {
        const message = exc instanceof Error ? exc.message : String(exc);
        appendActionLog({
            level: 'error',
            source: 'bridgeClient',
            action: 'network_error',
            method,
            path,
            request: requestBody,
            error: message,
            duration_ms: Math.round(performance.now() - startedAt),
        });
        throw exc;
    }

    const text = await response.text();
    let data: unknown = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = {message: text || `Bridge request failed: ${response.status}`};
    }

    if (!response.ok) {
        const message = parseErrorMessage(data, response.status);
        appendActionLog({
            level: 'error',
            source: 'bridgeClient',
            action: 'request_failed',
            method,
            path,
            request: requestBody,
            response: data,
            error: message,
            duration_ms: Math.round(performance.now() - startedAt),
        });
        throw new Error(message);
    }

    appendActionLog({
        level: 'success',
        source: 'bridgeClient',
        action: 'request_success',
        method,
        path,
        request: requestBody,
        response: data,
        duration_ms: Math.round(performance.now() - startedAt),
    });

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


export function getScreenTexts(): Promise<ScreenTextsResponse> {
    return bridgeRequest<ScreenTextsResponse>('/bridge/screen/texts');
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

    socket.onopen = () => {
        appendActionLog({
            level: 'event',
            source: 'diagnosticsWebSocket',
            action: 'open',
            path: '/bridge/diagnostics/events',
        });
        onStatus?.('connected');
    };
    socket.onclose = () => {
        appendActionLog({
            level: 'event',
            source: 'diagnosticsWebSocket',
            action: 'close',
            path: '/bridge/diagnostics/events',
        });
        onStatus?.('closed');
    };
    socket.onerror = () => {
        appendActionLog({
            level: 'error',
            source: 'diagnosticsWebSocket',
            action: 'error',
            path: '/bridge/diagnostics/events',
        });
        onStatus?.('error');
    };
    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data) as DiagnosticEventMessage;
            appendActionLog({
                level: 'event',
                source: 'diagnosticsWebSocket',
                action: 'message',
                path: '/bridge/diagnostics/events',
                response: message,
            });
            onMessage(message);
        } catch {
            const message = {
                event: 'unparsed_message',
                data: event.data,
            };
            appendActionLog({
                level: 'event',
                source: 'diagnosticsWebSocket',
                action: 'unparsed_message',
                path: '/bridge/diagnostics/events',
                response: message,
            });
            onMessage(message);
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
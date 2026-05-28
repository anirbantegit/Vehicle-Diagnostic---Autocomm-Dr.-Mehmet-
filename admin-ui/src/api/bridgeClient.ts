import {redactDisplayText} from '../utils/redactDisplay';
export const ACTION_LOG_STORAGE_KEY = 'diagnostic_bridge_action_logs';
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = 'autocom_bridge_admin_token';
const LEGACY_ACTION_LOG_STORAGE_KEY = 'autocom_bridge_action_logs';

let adminCsrfToken = '';
let adminSessionRefreshPromise: Promise<void> | null = null;

const REDACTED_KEYS = new Set([
    'access_token',
    'authorization',
    'csrf_token',
    'pairing_secret',
    'token',
    'token_hash',
]);


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
    expires_in: number;
    expires_at: string;
    pairing_url: string;
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

export type PairingStatus = 'pending' | 'claimed' | 'expired';

export type PairingStatusResponse = {
    pairing_id: string;
    status: PairingStatus;
    expires_at?: string;
    client_id?: string;
    client_name?: string;
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

export type TraceWindowRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

export type TraceWindow = {
    handle: number;
    pid: number | null;
    title: string;
    class_name: string;
    control_type: string;
    visible: boolean;
    enabled: boolean;
    engine_candidate: boolean;
    engine_label: string | null;
    rect: TraceWindowRect | null;
};

export type TraceControlItem = ScreenTextItem & {
    index: number;
    label: string;
};

export type TraceWindowsResponse = {
    windows: TraceWindow[];
};

export type TraceScreenResponse = {
    timestamp: string;
    window_detected: boolean;
    window: TraceWindow;
    window_rect: UiRectInfo;
    control_count: number;
    controls: TraceControlItem[];
    screenshot_data_url: string | null;
    clicked?: boolean;
    point?: {x: number; y: number; relative_x: number; relative_y: number};
    windows?: TraceWindow[];
    related_windows?: TraceWindow[];
    active_modal?: TraceControlItem | null;
    matched_control?: TraceControlItem | null;
    confirmed?: boolean;
    present?: boolean;
    action_result?: {performed: boolean; method: string | null; control: TraceControlItem};
    target_window_closed?: boolean;
};

export type NativeControlSelector = {
    automation_id?: string;
    text?: string;
    control_type?: string;
    parent_automation_id?: string;
};

export type RtdPopupAction = 'run' | 'select_vehicle' | 'help' | 'cancel';

export type RtdOpenResponse = {
    sent: unknown;
    confirmed: boolean;
    confirmation: string;
    popup_window_handle: number;
    popup: TraceControlItem;
    run_button: TraceControlItem;
    screen: TraceScreenResponse;
};


export type ActionLogEntry = {
    id: string;
    timestamp: string;
    level: 'info' | 'success' | 'warning' | 'error' | 'event';
    source: string;
    action: string;
    method?: string;
    path?: string;
    request?: unknown;
    response?: unknown;
    error?: string;
    system_log?: unknown;
    duration_ms?: number;
    status_code?: number;
    client?: string;
};

export type ServerActionLogsResponse = {
    logs: ActionLogEntry[];
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

export type DiagnosticFunctionItem = {
    index?: number | string;
    id?: string;
    name?: string;
    title?: string;
    icon?: string;
    help?: Array<{id?: string; [key: string]: unknown}>;
    [key: string]: unknown;
};

export type VinHistoryItem = {
    name: string;
    [key: string]: unknown;
};

export type VehicleContextResponse = {
    active_vehicle_definition_id: string;
    sent: unknown;
};

export type RtdVehicleOpenResponse = {
    active_vehicle_definition_id: string;
    rtd_function: DiagnosticFunctionItem;
    selection_sent: unknown;
    popup_sent: unknown;
};


export type AdminSessionResponse = {
    authenticated: boolean;
    csrf_token: string;
    expires_at: string;
};

export type HealthState = 'healthy' | 'attention' | 'blocked';

export type HealthResponse = {
    overall: HealthState;
    bridge: {status: HealthState; message: string};
    desktop_agent: {status: HealthState; message: string};
    engine: {
        status: HealthState;
        detected: boolean;
        ready?: boolean;
        engine_label?: string | null;
        local_api_reachable?: boolean;
        local_api_endpoint?: string;
        local_api_error?: string | null;
        message: string;
    };
    mobile_pairing: {status: HealthState; active_devices: number; message: string};
    hardware: {status: HealthState; verification: string; message: string};
};

function redactSensitiveValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return redactDisplayText(value);
    }

    if (Array.isArray(value)) {
        return value.map(redactSensitiveValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
                redactDisplayText(key),
                REDACTED_KEYS.has(key.toLowerCase())
                    ? '[REDACTED]'
                    : redactSensitiveValue(nestedValue),
            ]),
        );
    }

    return value;
}

export async function bootstrapAdminSession(): Promise<void> {
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_ACTION_LOG_STORAGE_KEY);

    const response = await fetch('/bridge/admin/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
    });

    if (!response.ok) {
        throw new Error('Unable to initialise the local Admin Console session.');
    }

    const session = (await response.json()) as AdminSessionResponse;
    adminCsrfToken = session.csrf_token;
}

async function refreshAdminSessionOnce(): Promise<void> {
    if (!adminSessionRefreshPromise) {
        adminSessionRefreshPromise = bootstrapAdminSession().finally(() => {
            adminSessionRefreshPromise = null;
        });
    }

    return adminSessionRefreshPromise;
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

function removeOversizedLogFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(removeOversizedLogFields);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
                if (key === 'screenshot_data_url') {
                    return [key, '[OMITTED_FROM_ACTION_LOG]'];
                }

                return [key, removeOversizedLogFields(nestedValue)];
            }),
        );
    }

    return value;
}


function clipForLog(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    const redactedValue = redactSensitiveValue(removeOversizedLogFields(value));
    const text = safeStringify(redactedValue);
    if (text.length <= MAX_LOG_PAYLOAD_CHARS) {
        try {
            return JSON.parse(text);
        } catch {
            return redactedValue;
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
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? redactSensitiveValue(parsed) as ActionLogEntry[]
            : [];
    } catch {
        return [];
    }
}

export function appendActionLog(entry: Omit<ActionLogEntry, 'id' | 'timestamp'>): ActionLogEntry {
    const nextEntry: ActionLogEntry = {
        id: nowLogId(),
        timestamp: new Date().toISOString(),
        ...entry,
        source: redactDisplayText(entry.source),
        action: redactDisplayText(entry.action),
        path: entry.path ? redactDisplayText(entry.path) : undefined,
        error: entry.error ? redactDisplayText(entry.error) : undefined,
        request: clipForLog(entry.request),
        response: clipForLog(entry.response),
    };

    const logs = [nextEntry, ...getActionLogs()].slice(0, MAX_ACTION_LOGS);
    let persistedLogs = logs;

    while (persistedLogs.length > 0) {
        try {
            localStorage.setItem(ACTION_LOG_STORAGE_KEY, JSON.stringify(persistedLogs));
            break;
        } catch {
            persistedLogs = persistedLogs.slice(0, Math.floor(persistedLogs.length / 2));
        }
    }

    if (persistedLogs.length === 0) {
        localStorage.removeItem(ACTION_LOG_STORAGE_KEY);
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

export function downloadActionLogs(logs: ActionLogEntry[] = getActionLogs()): void {
    const blob = new Blob([JSON.stringify(redactSensitiveValue(logs), null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostic-bridge-debug-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

export async function getServerActionLogs(): Promise<ActionLogEntry[]> {
    const response = await fetch('/bridge/admin/super-logs', {
        credentials: 'same-origin',
        headers: buildHeaders(undefined, true),
    });
    const data = (await response.json()) as ServerActionLogsResponse | {detail?: unknown};
    if (!response.ok) {
        throw new Error(parseErrorMessage(data, response.status));
    }
    const logs = (data as ServerActionLogsResponse).logs;
    return Array.isArray(logs) ? redactSensitiveValue(logs) as ActionLogEntry[] : [];
}

export async function clearServerActionLogs(): Promise<void> {
    const response = await fetch('/bridge/admin/super-logs', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: buildHeaders(undefined, true),
    });
    if (!response.ok) {
        const text = await response.text();
        let data: unknown = text;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            // Keep plain response text for diagnostics.
        }
        throw new Error(parseErrorMessage(data, response.status));
    }
}


function buildHeaders(options?: RequestInit, authenticated = true): HeadersInit {
    return {
        'Content-Type': 'application/json',
        ...(authenticated && adminCsrfToken ? {'X-CSRF-Token': adminCsrfToken} : {}),
        ...(options?.headers || {}),
    };
}

function nestedErrorCode(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as {code?: unknown; detail?: unknown};
    if (typeof candidate.code === 'string' && candidate.code.trim()) {
        return candidate.code;
    }

    return nestedErrorCode(candidate.detail);
}

function nestedErrorMessage(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }

    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as {
        code?: unknown;
        message?: unknown;
        detail?: unknown;
    };

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
        return typeof candidate.code === 'string' && candidate.code.trim()
            ? `${candidate.code}: ${candidate.message}`
            : candidate.message;
    }

    return nestedErrorMessage(candidate.detail);
}

function parseErrorMessage(data: unknown, status: number): string {
    return nestedErrorMessage(data) || `Bridge request failed: ${status}`;
}

export async function bridgeRequest<T>(
    path: string,
    options: RequestInit = {},
    authenticated = true,
    allowAdminSessionRefresh = true,
): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const requestBody = normalizeRequestBody(options.body);
    const startedAt = performance.now();
    let response: Response;

    try {
        response = await fetch(path, {
            ...options,
            credentials: 'same-origin',
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
        const errorCode = nestedErrorCode(data);
        const recoverableAdminSession = authenticated
            && allowAdminSessionRefresh
            && response.status === 401
            && (errorCode === 'INVALID_ADMIN_SESSION' || errorCode === 'INVALID_BRIDGE_TOKEN');

        if (recoverableAdminSession) {
            appendActionLog({
                level: 'error',
                source: 'bridgeClient',
                action: 'refresh_admin_session_after_rejection',
                method,
                path,
                response: data,
                error: 'Local Admin Console session was rejected; creating one fresh session and retrying once.',
                duration_ms: Math.round(performance.now() - startedAt),
            });
            await refreshAdminSessionOnce();
            return bridgeRequest<T>(path, options, authenticated, false);
        }

        const message = redactDisplayText(parseErrorMessage(data, response.status));
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

export function activateVehicleContext(
    vehicleDefinitionId: string,
    protocol = '',
): Promise<VehicleContextResponse> {
    return bridgeRequest<VehicleContextResponse>('/bridge/admin/vehicles/activate', {
        method: 'POST',
        body: JSON.stringify({
            vehicle_definition_id: vehicleDefinitionId,
            protocol: protocol.trim() || null,
        }),
    });
}

export function getVinAvailable(): Promise<boolean> {
    return bridgeRequest<boolean>('/bridge/vin/isavailable');
}

export function getVinHistory(): Promise<VinHistoryItem[]> {
    return bridgeRequest<VinHistoryItem[]>('/bridge/vin/history');
}

export function selectVehicleByVin(vin: string): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/admin/vin/select', {
        method: 'POST',
        body: JSON.stringify({vin}),
    });
}

export function readVinFromVehicle(): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/admin/vin/read', {
        method: 'POST',
    });
}

export function openVehicleRtdFunction(
    vehicleDefinitionId: string,
    rtdIndex: number,
    protocol = '',
): Promise<RtdVehicleOpenResponse> {
    return bridgeRequest<RtdVehicleOpenResponse>('/bridge/admin/vehicles/rtd/open', {
        method: 'POST',
        body: JSON.stringify({
            vehicle_definition_id: vehicleDefinitionId,
            rtd_index: rtdIndex,
            protocol: protocol.trim() || null,
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
): Promise<DiagnosticFunctionItem[]> {
    const query = protocol.trim()
        ? `?protocol=${encodeURIComponent(protocol.trim())}`
        : '';

    return bridgeRequest<DiagnosticFunctionItem[]>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/obd-functions${query}`,
    );
}

export function getVehicleRtdFunctions(
    vehicleDefinitionId: string,
    protocol = '',
): Promise<DiagnosticFunctionItem[]> {
    const query = protocol.trim()
        ? `?protocol=${encodeURIComponent(protocol.trim())}`
        : '';

    return bridgeRequest<DiagnosticFunctionItem[]>(
        `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/rtd-functions${query}`,
    );
}


export function getScreenTexts(): Promise<ScreenTextsResponse> {
    return bridgeRequest<ScreenTextsResponse>('/bridge/screen/texts');
}

export function getTraceWindows(): Promise<TraceWindowsResponse> {
    return bridgeRequest<TraceWindowsResponse>('/bridge/admin/trace/windows');
}

export function getTraceWindowScreen(
    windowHandle: number,
    includePreview = true,
): Promise<TraceScreenResponse> {
    const previewQuery = includePreview ? '' : '?include_preview=false';
    return bridgeRequest<TraceScreenResponse>(
        `/bridge/admin/trace/windows/${encodeURIComponent(String(windowHandle))}/screen${previewQuery}`,
    );
}

export function clickTraceWindowPoint(
    windowHandle: number,
    x: number,
    y: number,
): Promise<TraceScreenResponse> {
    return bridgeRequest<TraceScreenResponse>(
        `/bridge/admin/trace/windows/${encodeURIComponent(String(windowHandle))}/click-point`,
        {
            method: 'POST',
            body: JSON.stringify({x, y}),
        },
    );
}

export function waitForNativeControl(
    windowHandle: number,
    selector: NativeControlSelector,
    present = true,
    timeoutSeconds = 5,
): Promise<TraceScreenResponse> {
    return bridgeRequest<TraceScreenResponse>(
        `/bridge/admin/trace/windows/${encodeURIComponent(String(windowHandle))}/wait-control`,
        {
            method: 'POST',
            body: JSON.stringify({...selector, present, timeout_seconds: timeoutSeconds}),
        },
    );
}

export function invokeNativeControl(
    windowHandle: number,
    selector: NativeControlSelector,
    action: 'invoke' | 'select' | 'toggle' = 'invoke',
): Promise<TraceScreenResponse> {
    return bridgeRequest<TraceScreenResponse>(
        `/bridge/admin/trace/windows/${encodeURIComponent(String(windowHandle))}/control-action`,
        {
            method: 'POST',
            body: JSON.stringify({...selector, action}),
        },
    );
}

export function openRtdPopupAndConfirm(
    windowHandle: number,
    rtdIndex: number,
): Promise<RtdOpenResponse> {
    return bridgeRequest<RtdOpenResponse>('/bridge/admin/automation/rtd/open', {
        method: 'POST',
        body: JSON.stringify({window_handle: windowHandle, rtd_index: rtdIndex}),
    });
}

export function invokeRtdPopupAction(
    windowHandle: number,
    action: RtdPopupAction,
    fallbackWindowHandle?: number,
): Promise<TraceScreenResponse> {
    return bridgeRequest<TraceScreenResponse>('/bridge/admin/automation/rtd/popup-action', {
        method: 'POST',
        body: JSON.stringify({
            window_handle: windowHandle,
            fallback_window_handle: fallbackWindowHandle,
            action,
        }),
    });
}

export function selectRtdLocation(
    windowHandle: number,
    locationText: string,
    fallbackWindowHandle?: number,
): Promise<TraceScreenResponse> {
    return bridgeRequest<TraceScreenResponse>('/bridge/admin/automation/rtd/select-location', {
        method: 'POST',
        body: JSON.stringify({
            window_handle: windowHandle,
            fallback_window_handle: fallbackWindowHandle,
            location_text: locationText,
        }),
    });
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
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
        `${wsProtocol}//${window.location.host}/bridge/diagnostics/events`,
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

export function getPairingStatus(
    pairingId: string,
): Promise<PairingStatusResponse> {
    return bridgeRequest<PairingStatusResponse>(
        `/bridge/pairing/${encodeURIComponent(pairingId)}/status`,
    );
}


export function getClients(): Promise<ClientsResponse> {
    return bridgeRequest<ClientsResponse>('/bridge/clients');
}

export function disconnectClient(clientId: string): Promise<unknown> {
    return bridgeRequest<unknown>(`/bridge/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
    });
}

export function getHealth(): Promise<HealthResponse> {
    return bridgeRequest<HealthResponse>('/bridge/admin/health');
}
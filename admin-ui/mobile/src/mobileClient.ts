export const MOBILE_TOKEN_STORAGE_KEY = 'diagnostic_engine_mobile_pair_token';

export type BridgeIdentity = {
    device_id: string;
    device_name: string;
    base_url: string;
    bridge_version: string;
    status: string;
};

export type PairedClient = {
    client_id: string;
    client_name: string;
    client_type: string;
    paired_at: string;
    last_seen_at: string | null;
    revoked: boolean;
};

export type MobileSession = {
    paired: boolean;
    device: BridgeIdentity;
    client: PairedClient;
    engine: {
        local_api_reachable: boolean;
        local_api_endpoint: string;
        local_api_error: string | null;
    };
};

export type PairingClaimResponse = {
    device_id: string;
    client_id: string;
    client_name: string;
    client_type: string;
    access_token: string;
    base_url: string;
    paired_at: string;
};

export type VehicleListType =
    | 'brands'
    | 'models'
    | 'years'
    | 'systemTypes'
    | 'engines'
    | 'systems'
    | 'gearboxes'
    | 'equipments';

export type VehicleSelectionItem = {
    id: string;
    name?: string;
    title?: string;
    help?: Array<{id?: string; [key: string]: unknown}>;
    [key: string]: unknown;
};

export type VehicleSelectionResponse = {
    items?: VehicleSelectionItem[];
    currentTitle?: string;
    type?: string;
    [key: string]: unknown;
};

export type DiagnosticFunctionItem = {
    index?: number | string;
    id?: string;
    name?: string;
    title?: string;
    [key: string]: unknown;
};

export type VehicleContextResponse = {
    active_vehicle_definition_id: string;
    sent: unknown;
};

export type VinHistoryItem = {
    id?: string;
    name: string;
    [key: string]: unknown;
};

export type DiagnosticEventMessage = {
    event: string;
    data: unknown;
};

export type RtdPopupAction = 'run' | 'select_vehicle' | 'help' | 'cancel';

export type NativeClickPoint = {
    x: number;
    y: number;
};

export type NativePopupControl = {
    text?: string;
    automation_id?: string;
    control_type?: string;
    class_name?: string;
    rect?: Record<string, number> | null;
    click_point?: NativeClickPoint | null;
};

export type NativePopupLocation = {
    index: number;
    text: string;
    title?: string;
    automation_id: string;
    control_type: 'ListItem';
    rect?: Record<string, number> | null;
    click_point?: NativeClickPoint | null;
    selected?: boolean | null;
    selection_source?: string | null;
};

export type NativePopupIdentity = {
    kind: 'rtd_obd_function_popup';
    template_version?: number;
    blocking?: boolean;
    automation_id: 'FormOBDFunction';
    function_title: string;
    vehicle_title: string;
    location_list_automation_id?: 'listBoxLocations' | null;
    observed_signature_ids: string[];
    required_signature_ids: string[];
    signature_confirmed: boolean;
    signature: string;
    selection_source?: string | null;
};

export type NativePopupState = {
    popup_open: boolean;
    blocking: boolean;
    confirmed: boolean;
    command_sent?: boolean | null;
    confirmation: string;
    warning?: string | null;
    detection_method?: string | null;
    popup_template?: string | null;
    available_actions?: RtdPopupAction[];
    popup_window_handle?: number | null;
    source_window_handle?: number;
    popup?: unknown;
    popup_identity?: NativePopupIdentity | null;
    locations?: NativePopupLocation[];
    action_controls?: Partial<Record<RtdPopupAction, NativePopupControl>>;
    run_button?: NativePopupControl | null;
    run_button_confirmed?: boolean;
    command_result?: unknown;
    screen?: unknown;
};

export type NativePopupResponse = NativePopupState & {
    active_vehicle_definition_id: string;
    rtd_function: DiagnosticFunctionItem;
    selection_sent: unknown;
    sent: unknown;
    already_open?: boolean;
    source_window_handle: number;
};

export type MobileRequestArgs = {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    authenticated?: boolean;
};

const storedToken = (): string => window.localStorage.getItem(MOBILE_TOKEN_STORAGE_KEY) || '';

export const hasMobileToken = (): boolean => Boolean(storedToken());

export const storeMobileToken = (token: string): void => {
    window.localStorage.setItem(MOBILE_TOKEN_STORAGE_KEY, token);
};

export const forgetMobileToken = (): void => {
    window.localStorage.removeItem(MOBILE_TOKEN_STORAGE_KEY);
};

const nestedMessage = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value as {message?: unknown; detail?: unknown};
    return nestedMessage(candidate.message) || nestedMessage(candidate.detail);
};

export const mobileRequest = async <T>({
    path,
    method = 'GET',
    body,
    authenticated = true,
}: MobileRequestArgs): Promise<T> => {
    const headers = new Headers();
    if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
    }
    if (authenticated) {
        const token = storedToken();
        if (!token) {
            throw new Error('This phone is not paired. Scan a fresh QR code from the PC console.');
        }
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        if (response.status === 401) {
            forgetMobileToken();
        }
        throw new Error(nestedMessage(data) || `Mobile request failed with HTTP ${response.status}.`);
    }

    return data as T;
};

export const createDiagnosticsEventSocket = (
    onMessage: (message: DiagnosticEventMessage) => void,
    onStatus?: (status: string) => void,
): WebSocket | null => {
    const token = storedToken();
    if (!token) {
        onStatus?.('Not connected');
        return null;
    }
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
        `${wsProtocol}//${window.location.host}/bridge/diagnostics/events?token=${encodeURIComponent(token)}`,
    );
    socket.addEventListener('open', () => onStatus?.('Live'));
    socket.addEventListener('close', () => onStatus?.('Disconnected'));
    socket.addEventListener('error', () => onStatus?.('Error'));
    socket.addEventListener('message', (event) => {
        try {
            onMessage(JSON.parse(String(event.data)) as DiagnosticEventMessage);
        } catch {
            onStatus?.('Invalid event');
        }
    });
    return socket;
};

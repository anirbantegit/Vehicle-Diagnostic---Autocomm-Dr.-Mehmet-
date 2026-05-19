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
    const data = text ? JSON.parse(text) : null;

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

export function runDiagnosis(payload: RunDiagnosisPayload): Promise<unknown> {
    return bridgeRequest<unknown>('/bridge/diagnostics/run', {
        method: 'POST',
        body: JSON.stringify(payload),
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
import React, {useEffect, useState} from 'react';
import {QRCodeCanvas} from 'qrcode.react';
import {HealthState, PairingStartResponse, PairingStatus} from '../api/bridgeClient';
import {
    useGetClientsQuery,
    useGetHealthQuery,
    useGetPairingStatusQuery,
    useGetPublicIdentityQuery,
    useRevokeClientMutation,
    useStartPairingMutation,
} from '../services/bridgeApi';


const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e6eaf2',
};

const button: React.CSSProperties = {
    border: 0,
    borderRadius: 12,
    padding: '10px 14px',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
};
const secondaryButton: React.CSSProperties = {
    ...button,
    background: '#e2e8f0',
    color: '#0f172a',
};

const dangerButton: React.CSSProperties = {
    ...button,
    background: '#dc2626',
};

const muted: React.CSSProperties = {
    color: '#64748b',
    fontSize: 13,
};

const healthGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
};

type HealthCheck = {
    status: HealthState;
    message: string;
};

const healthAppearance: Record<
    HealthState,
    {label: string; color: string; background: string}
> = {
    healthy: {
        label: 'Ready',
        color: '#166534',
        background: '#dcfce7',
    },
    attention: {
        label: 'Check',
        color: '#92400e',
        background: '#fef3c7',
    },
    blocked: {
        label: 'Blocked',
        color: '#991b1b',
        background: '#fee2e2',
    },
};
function StatusBadge({state, label}: { state: HealthState; label?: string }) {
    const appearance = healthAppearance[state];

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 800,
                color: appearance.color,
                background: appearance.background,
            }}
        >
            {label || appearance.label}
        </span>
    );
}

function HealthCard({title, check}: { title: string; check?: HealthCheck }) {
    const state = check?.status || 'attention';

    return (
        <div style={{...card, boxShadow: 'none'}}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 10,
                }}
            >
                <h4 style={{margin: 0, fontSize: 14}}>{title}</h4>
                <StatusBadge state={state}/>
            </div>

            <p style={{...muted, margin: 0}}>
                {check?.message || 'Checking setup status...'}
            </p>
        </div>
    );
}

function OnboardingStep({
    number,
    title,
    description,
}: {
    number: number;
    title: string;
    description: string;
}) {
    return (
        <div
            style={{
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
            }}
        >
            <span
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    fontSize: 13,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                {number}
            </span>
            <div>
                <strong style={{fontSize: 14}}>{title}</strong>
                <p style={{...muted, margin: '5px 0 0', lineHeight: 1.5}}>{description}</p>
            </div>
        </div>
    );
}

function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}


export default function Dashboard() {
    const {
        data: health = null,
        isFetching: isHealthFetching,
        error: healthError,
        refetch: refetchHealth,
    } = useGetHealthQuery();
    const {
        data: identity = null,
        isFetching: isIdentityFetching,
        error: identityError,
        refetch: refetchIdentity,
    } = useGetPublicIdentityQuery();
    const {
        data: clientsResponse,
        isFetching: isClientsFetching,
        error: clientsError,
        refetch: refetchClients,
    } = useGetClientsQuery();
    const [startPairingRequest, {isLoading: isStartingPairing}] = useStartPairingMutation();
    const [revokeClientRequest, {isLoading: isRevokingClient}] = useRevokeClientMutation();
    const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
    const [pairingStatus, setPairingStatus] = useState<PairingStatus | 'idle'>('idle');
    const [actionError, setActionError] = useState<string>('');

    const clients = clientsResponse?.clients ?? [];
    const {data: latestPairingStatus, error: pairingStatusError} = useGetPairingStatusQuery(
        pairing?.pairing_id ?? '',
        {
            skip: !pairing || pairingStatus !== 'pending',
            pollingInterval: 1500,
        },
    );

    function queryErrorMessage(error: unknown): string {
        if (!error || typeof error !== 'object') {
            return '';
        }

        const candidate = error as {data?: {message?: string}; message?: string};
        return candidate.data?.message || candidate.message || '';
    }

    async function refreshOverview(): Promise<void> {
        setActionError('');
        try {
            await Promise.all([refetchHealth(), refetchIdentity(), refetchClients()]);
        } catch (exc) {
            setActionError(exc instanceof Error ? exc.message : String(exc));
        }
    }

    async function handleStartPairing(): Promise<void> {
        setActionError('');

        try {
            const result = await startPairingRequest().unwrap();
            setPairing(result);
            setPairingStatus('pending');
        } catch (exc) {
            setActionError(exc instanceof Error ? exc.message : String(exc));
        }
    }

    async function handleRevoke(clientId: string): Promise<void> {
        setActionError('');

        try {
            await revokeClientRequest(clientId).unwrap();
            await Promise.all([refetchHealth(), refetchClients()]);
        } catch (exc) {
            setActionError(exc instanceof Error ? exc.message : String(exc));
        }
    }

    useEffect(() => {
        if (!latestPairingStatus) {
            return;
        }

        setPairingStatus(latestPairingStatus.status);
        if (latestPairingStatus.status === 'claimed') {
            void Promise.all([refetchHealth(), refetchClients()]);
        }
    }, [latestPairingStatus, refetchClients, refetchHealth]);

    const busy = isHealthFetching || isIdentityFetching || isClientsFetching
        ? 'health'
        : isStartingPairing
            ? 'pairing'
            : isRevokingClient
                ? 'revoke'
                : '';
    const error = actionError
        || queryErrorMessage(healthError)
        || queryErrorMessage(identityError)
        || queryErrorMessage(clientsError)
        || queryErrorMessage(pairingStatusError);

    const requiredConnectionChecks = health
        ? [health.bridge.status, health.desktop_agent.status, health.engine.status]
        : [];
    const connectionState: HealthState = !health
        ? 'attention'
        : requiredConnectionChecks.includes('blocked')
            ? 'blocked'
            : requiredConnectionChecks.every((status) => status === 'healthy')
                ? 'healthy'
                : 'attention';
    const engineReady = connectionState === 'healthy';
    const activeClients = clients.filter((client) => !client.revoked);
    const qrText = pairing ? pairing.pairing_url : '';
    const pairingUsesLoopback = Boolean(
        pairing && /\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(pairing.pairing_url),
    );


    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Connect a Mobile Device</h2>
                <p style={{...muted, margin: '6px 0 0'}}>
                    Check the computer setup, scan a QR code with the phone camera, and use the
                    Mobile Portal to browse vehicle selection.
                </p>
            </header>

            <section
                style={{
                    ...card,
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 18,
                }}
            >
                <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
                        <h3 style={{margin: 0}}>
                            {engineReady ? 'Computer is ready for mobile connection' : 'Check setup before connecting'}
                        </h3>
                        <StatusBadge
                            state={connectionState}
                            label={engineReady ? 'Ready to Pair' : connectionState === 'blocked' ? 'Blocked' : 'Needs Check'}
                        />
                    </div>
                    <p style={{...muted, margin: 0}}>
                        Run this check before pairing. Physical VCI validation can remain pending until the tester is available.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refreshOverview}
                    style={button}
                    disabled={Boolean(busy)}
                >
                    {busy === 'health' ? 'Checking...' : 'Check Setup Now'}
                </button>
            </section>

            {error && (
                <div
                    style={{
                        ...card,
                        marginBottom: 18,
                        background: '#fff1f2',
                        borderColor: '#fecdd3',
                        color: '#9f1239',
                    }}
                >
                    {error}
                </div>
            )}

            <section style={{...healthGrid, marginBottom: 18}}>
                <HealthCard title="Bridge Service" check={health?.bridge}/>
                <HealthCard title="Desktop Agent" check={health?.desktop_agent}/>
                <HealthCard title="Diagnostic Engine" check={health?.engine}/>
                <HealthCard title="Mobile Connection" check={health?.mobile_pairing}/>
                <HealthCard title="Vehicle Hardware" check={health?.hardware}/>
            </section>

            <section style={{...card, marginBottom: 18}}>
                <h3 style={{margin: '0 0 14px'}}>Simple connection steps</h3>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12}}>
                    <OnboardingStep
                        number={1}
                        title="Check setup"
                        description="Ensure the service, desktop agent and diagnostic engine are ready."
                    />
                    <OnboardingStep
                        number={2}
                        title="Scan QR"
                        description="Generate the QR code below and scan it with the phone camera."
                    />
                    <OnboardingStep
                        number={3}
                        title="Confirm device"
                        description="Your paired mobile device appears in the connected-device list."
                    />
                </div>
            </section>

            <section
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(360px, 1fr) 370px',
                    gap: 18,
                    marginBottom: 18,
                    alignItems: 'start',
                }}
            >
                <div style={card}>
                    <h3 style={{margin: '0 0 8px'}}>Step 2 — Pair your mobile device</h3>
                    <p style={{...muted, margin: '0 0 18px', lineHeight: 1.6}}>
                        On your phone, use the camera to scan this QR code. It opens the secure,
                        short-lived Mobile Portal pairing page automatically.
                    </p>

                    <div
                        style={{
                            borderRadius: 14,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            padding: 14,
                            marginBottom: 16,
                        }}
                    >
                        <div style={{fontSize: 12, color: '#64748b', marginBottom: 4}}>
                            Connecting to
                        </div>
                        <strong>{identity?.device_name || 'This computer'}</strong>
                        {identity?.base_url && (
                            <div style={{...muted, marginTop: 5}}>{identity.base_url}</div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleStartPairing}
                        style={button}
                        disabled={busy === 'pairing'}
                    >
                        {busy === 'pairing'
                            ? 'Generating...'
                            : pairing
                                ? 'Generate New QR Code'
                                : 'Generate QR Code'}
                    </button>

                    {pairing && (
                        <>
                            <p style={{...muted, margin: '14px 0 0'}}>
                                Pairing status: <strong>{pairingStatus}</strong>
                                <br/>
                                QR expires at: <strong>{formatDate(pairing.expires_at)}</strong>
                            </p>
                            {pairingUsesLoopback && (
                                <p style={{...muted, color: '#991b1b', marginTop: 10}}>
                                    This QR uses localhost and cannot be opened from a phone. Set
                                    <strong> BRIDGE_PUBLIC_HOST</strong> in the production environment to this PC&apos;s LAN IP.
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div style={{...card, textAlign: 'center'}}>
                    <h3 style={{margin: '0 0 14px'}}>Scan from Mobile</h3>
                    {pairing ? (
                        <>
                            <div
                                style={{
                                    display: 'inline-block',
                                    background: '#fff',
                                    padding: 10,
                                    borderRadius: 16,
                                    border: '1px solid #e2e8f0',
                                }}
                            >
                                <QRCodeCanvas value={qrText} size={235} marginSize={8}/>
                            </div>
                            <div style={{marginTop: 12}}>
                                <StatusBadge
                                    state={pairingStatus === 'claimed' ? 'healthy' : pairingStatus === 'expired' ? 'blocked' : 'attention'}
                                    label={
                                        pairingStatus === 'claimed'
                                            ? 'Device Connected'
                                            : pairingStatus === 'expired'
                                                ? 'QR Expired'
                                                : 'Waiting for Scan'
                                    }
                                />
                            </div>
                            <p style={{...muted, margin: '12px 0 0', wordBreak: 'break-all'}}>
                                Opens: {pairing.pairing_url}
                            </p>
                        </>
                    ) : (
                        <div
                            style={{
                                minHeight: 255,
                                borderRadius: 16,
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                padding: 18,
                                color: '#64748b',
                                fontSize: 13,
                            }}
                        >
                            Generate a QR code to connect a mobile device.
                        </div>
                    )}
                </div>
            </section>

            <section style={card}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        marginBottom: 16,
                    }}
                >
                    <div>
                        <h3 style={{margin: 0}}>Step 3 — Connected Devices</h3>
                        <p style={{...muted, margin: '5px 0 0'}}>
                            {activeClients.length} active mobile device{activeClients.length === 1 ? '' : 's'} connected.
                        </p>
                    </div>
                    <button
                        type="button"
                        style={secondaryButton}
                        onClick={refreshOverview}
                        disabled={Boolean(busy)}
                    >
                        Refresh
                    </button>
                </div>

                <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 14}}>
                        <thead>
                        <tr style={{background: '#f8fafc'}}>
                            <th style={th}>Device</th>
                            <th style={th}>Type</th>
                            <th style={th}>Last Seen</th>
                            <th style={th}>Status</th>
                            <th style={th}>Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {clients.length === 0 && (
                            <tr>
                                <td style={td} colSpan={5}>
                                    No mobile device connected yet. Generate and scan the QR code above.
                                </td>
                            </tr>
                        )}
                        {clients.map((client) => (
                            <tr key={client.client_id}>
                                <td style={td}>
                                    <strong>{client.client_name}</strong>
                                    <div style={{...muted, fontSize: 12}}>{client.client_id}</div>
                                </td>
                                <td style={td}>{client.client_type}</td>
                                <td style={td}>{formatDate(client.last_seen_at)}</td>
                                <td style={td}>
                                    <StatusBadge
                                        state={client.revoked ? 'blocked' : 'healthy'}
                                        label={client.revoked ? 'Removed' : 'Connected'}
                                    />
                                </td>
                                <td style={td}>
                                    <button
                                        type="button"
                                        style={dangerButton}
                                        disabled={client.revoked || Boolean(busy)}
                                        onClick={() => handleRevoke(client.client_id)}
                                    >
                                        Remove Access
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

            </section>
        </div>
    );
}

const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 14px',
    borderBottom: '1px solid #e2e8f0',
    color: '#475569',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
};

const td: React.CSSProperties = {
    padding: '14px',
    borderBottom: '1px solid #eef2f7',
    verticalAlign: 'top',
};
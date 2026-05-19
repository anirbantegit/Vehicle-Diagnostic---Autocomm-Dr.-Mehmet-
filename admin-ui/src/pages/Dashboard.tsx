import React, {useEffect, useState} from 'react';
import {
    BridgeIdentity,
    BridgeStatus,
    getAutocomProduct,
    getBridgeStatus,
    getPublicIdentity,
    getSignalrStatus,
} from '../api/bridgeClient';

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

const muted: React.CSSProperties = {
    color: '#64748b',
    fontSize: 13,
};

const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
};

function JsonBlock({value}: { value: unknown }) {
    return (
        <pre
            style={{
                margin: 0,
                marginTop: 12,
                padding: 14,
                borderRadius: 14,
                background: '#0f172a',
                color: '#dbeafe',
                overflow: 'auto',
                maxHeight: 320,
                fontSize: 12,
            }}
        >
    {JSON.stringify(value, null, 2)}
    </pre>
    );
}

function StatusBadge({ok}: { ok: boolean }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 800,
                color: ok ? '#166534' : '#991b1b',
                background: ok ? '#dcfce7' : '#fee2e2',
            }}
        >
    {ok ? 'OK' : 'Needs check'}
    </span>
    );
}

export default function Dashboard() {
    const [loading, setLoading] = useState(false);
    const [identity, setIdentity] = useState<BridgeIdentity | null>(null);
    const [status, setStatus] = useState<BridgeStatus | null>(null);
    const [product, setProduct] = useState<unknown>(null);
    const [signalr, setSignalr] = useState<unknown>(null);
    const [error, setError] = useState('');

    async function refresh() {
        setLoading(true);
        setError('');

        try {
            const [identityResult, statusResult, productResult, signalrResult] =
                await Promise.allSettled([
                    getPublicIdentity(),
                    getBridgeStatus(),
                    getAutocomProduct(),
                    getSignalrStatus(),
                ]);

            if (identityResult.status === 'fulfilled') {
                setIdentity(identityResult.value);
            }

            if (statusResult.status === 'fulfilled') {
                setStatus(statusResult.value);
            }

            if (productResult.status === 'fulfilled') {
                setProduct(productResult.value);
            } else {
                setProduct({error: productResult.reason?.message || 'Product API failed'});
            }

            if (signalrResult.status === 'fulfilled') {
                setSignalr(signalrResult.value);
            } else {
                setSignalr({error: signalrResult.reason?.message || 'SignalR status failed'});
            }

            if (statusResult.status === 'rejected') {
                setError(statusResult.reason?.message || 'Bridge status failed');
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    const agentFound =
        Boolean(status
            &&
            typeof status.agent === 'object'
            &&
            status.agent !== null
        )


    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Dashboard</h2>
                <p style={{...muted, margin: '6px 0 0'}}>
                    Central status for Bridge Service, Desktop Agent, Autocom API, and SignalR.
                </p>
            </header>

            <div style={{marginBottom: 18}}>
                <button type="button" onClick={refresh} style={button} disabled={loading}>
                    {loading ? 'Refreshing...' : 'Refresh status'}
                </button>
            </div>

            {error && (
                <div
                    style={{
                        ...card,
                        marginBottom: 16,
                        background: '#fff1f2',
                        borderColor: '#fecdd3',
                        color: '#9f1239',
                    }}
                >
                    {error}
                </div>
            )
            }

            <section style={grid}>
                <div style={card}>
                    <h3 style={{marginTop: 0}}>Bridge Identity</h3>
                    <StatusBadge ok={Boolean(identity)}/>
                    <JsonBlock value={identity || {message: 'No identity loaded yet'}}/>
                </div>

                <div style={card}>
                    <h3 style={{marginTop: 0}}>Bridge + Desktop Agent</h3>
                    <StatusBadge ok={Boolean(status && !status.agent_error)}/>
                    <JsonBlock
                        value={{
                            bridge: status?.bridge,
                            bridge_port: status?.bridge_port,
                            agent_found: agentFound,
                            agent_error: status?.agent_error,
                            agent: status?.agent,
                        }}
                    />
                </div>

                <div style={card}>
                    <h3 style={{marginTop: 0}}>Autocom Product API</h3>
                    <StatusBadge ok={Boolean(product && !(product as { error?: string }).error)}/>
                    <JsonBlock value={product || {message: 'Not loaded'}}/>
                </div>

                <div style={card}>
                    <h3 style={{marginTop: 0}}>SignalR Runtime</h3>
                    <StatusBadge ok={Boolean(signalr && !(signalr as { error?: string }).error)}/>
                    <JsonBlock value={signalr || {message: 'Not loaded'}}/>
                </div>
            </section>
        </div>
    )

}
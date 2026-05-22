import React, {useEffect, useState} from 'react';
import {getHealth, HealthResponse, HealthState} from '../api/bridgeClient';

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

type HealthCheck = {
    status: HealthState;
    message: string;
};

const healthAppearance: Record<
    HealthState,
    {label: string; color: string; background: string}
> = {
    healthy: {
        label: 'Healthy',
        color: '#166534',
        background: '#dcfce7',
    },
    attention: {
        label: 'Attention',
        color: '#92400e',
        background: '#fef3c7',
    },
    blocked: {
        label: 'Blocked',
        color: '#991b1b',
        background: '#fee2e2',
    },
};

function HealthCard({title, check}: { title: string; check?: HealthCheck }) {
    const state = check?.status || 'attention';
    const appearance = healthAppearance[state];

    return (
        <div style={card}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <h3 style={{margin: 0}}>{title}</h3>
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
                    {appearance.label}
                </span>
            </div>

            <p style={{...muted, margin: 0}}>
                {check?.message || 'Status has not been loaded yet.'}
            </p>
        </div>
    );
}

export default function Dashboard() {
    const [loading, setLoading] = useState(false);
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [error, setError] = useState('');

    async function refresh() {
        setLoading(true);
        setError('');

        try {
            setHealth(await getHealth());

        } catch (exc) {
            setHealth(null);
            setError(exc instanceof Error ? exc.message : String(exc));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);


    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Dashboard</h2>
                <p style={{...muted, margin: '6px 0 0'}}>
                    Central status for Bridge Service, Desktop Agent, Diagnostic Engine and runtime events.
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
                <HealthCard title="Bridge Service" check={health?.bridge}/>
                <HealthCard title="Desktop Agent" check={health?.desktop_agent}/>
                <HealthCard title="Diagnostic Engine" check={health?.engine}/>
                <HealthCard title="Mobile Pairing" check={health?.mobile_pairing}/>
                <HealthCard title="VCI Validation" check={health?.hardware}/>
            </section>
        </div>
    );
}
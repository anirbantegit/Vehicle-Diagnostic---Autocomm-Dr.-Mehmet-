import React, {useEffect, useState} from 'react';
import {disconnectClient, getClients, PairedClient} from '../api/bridgeClient';

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

const disconnectButton: React.CSSProperties = {
    ...button,
    background: '#dc2626',
};

export default function Clients() {
    const [clients, setClients] = useState<PairedClient[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function refresh() {
        setBusy(true);
        setError('');
        try {
            const result = await getClients();
            setClients(result.clients);
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : String(exc));
        } finally {
            setBusy(false);
        }
    }

    async function handleDisconnect(clientId: string) {
        setBusy(true);
        setError('');
        try {
            await disconnectClient(clientId);
            await refresh();
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : String(exc));
            setBusy(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Clients</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    Manage paired mobile/web clients. Tokens are stored hashed on backend.
                </p>
            </header>

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
                    <h3 style={{margin: 0}}>Paired Clients</h3>
                    <button type="button" style={button} onClick={refresh} disabled={busy}>
                        {busy ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                <div style={{overflowX: 'auto'}}>
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'separate',
                            borderSpacing: 0,
                            fontSize: 14,
                        }}
                    >
                        <thead>
                        <tr style={{background: '#f8fafc'}}>
                            <th style={th}>Client</th>
                            <th style={th}>Type</th>
                            <th style={th}>Paired At</th>
                            <th style={th}>Last Seen</th>
                            <th style={th}>Status</th>
                            <th style={th}>Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {clients.length === 0 && (
                            <tr>
                                <td style={td} colSpan={6}>
                                    No paired clients yet.
                                </td>
                            </tr>
                        )}

                        {clients.map((client) => (
                            <tr key={client.client_id}>
                                <td style={td}>
                                    <strong>{client.client_name}</strong>
                                    <div style={{color: '#64748b', fontSize: 12}}>
                                        {client.client_id}
                                    </div>
                                </td>
                                <td style={td}>{client.client_type}</td>
                                <td style={td}>{client.paired_at}</td>
                                <td style={td}>{client.last_seen_at || '-'}</td>
                                <td style={td}>
        <span
            style={{
                borderRadius: 999,
                padding: '5px 10px',
                fontWeight: 800,
                fontSize: 12,
                color: client.revoked ? '#991b1b' : '#166534',
                background: client.revoked ? '#fee2e2' : '#dcfce7',
            }}
        >
        {client.revoked ? 'Revoked' : 'Active'}
        </span>
                                </td>
                                <td style={td}>
                                    <button
                                        type="button"
                                        style={disconnectButton}
                                        disabled={client.revoked || busy}
                                        onClick={() => handleDisconnect(client.client_id)}
                                    >
                                        Disconnect
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )

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
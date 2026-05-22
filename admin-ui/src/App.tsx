import React, {useEffect, useState} from 'react';
import Dashboard from './pages/Dashboard';
import EngineControl from './pages/EngineControl';
import VehicleSelection from './pages/VehicleSelection';
import Pairing from './pages/Pairing';
import Clients from './pages/Clients';
import DebugLogs from './pages/DebugLogs';
import Settings from './pages/Settings';
import {bootstrapAdminSession} from './api/bridgeClient';

type PageKey = 'dashboard' | 'vehicle-selection' | 'engine' | 'pairing' | 'clients' | 'logs' | 'settings';

const pages: Array<{ key: PageKey; label: string; description: string }> = [
    {key: 'dashboard', label: 'Dashboard', description: 'Bridge, Agent, Engine status'},
    {key: 'vehicle-selection', label: 'Vehicle Selection', description: 'Brands, models, years, variants'},
    {key: 'engine', label: 'Engine Control', description: 'Runtime control, Generic OBD, VCI, Events'},
    {key: 'pairing', label: 'Pairing', description: 'Device identity and QR pairing'},
    {key: 'clients', label: 'Clients', description: 'Paired devices and revoke access'},
    {key: 'logs', label: 'Super Logs', description: 'Actions, responses, errors, events'},
    {key: 'settings', label: 'Settings', description: 'Local security and runtime notes'},
];

const styles: Record<string, React.CSSProperties> = {
    shell: {
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background: '#f4f6fb',
        color: '#172033',
        fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    sidebar: {
        background: '#101827',
        color: '#fff',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
    },
    brand: {
        paddingBottom: 14,
        borderBottom: '1px solid rgba(255,255,255,0.14)',
    },
    brandTitle: {
        margin: 0,
        fontSize: 22,
        fontWeight: 800,
    },
    brandSub: {
        margin: '6px 0 0',
        color: '#9da8bd',
        fontSize: 13,
        lineHeight: 1.4,
    },
    nav: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    navButton: {
        border: 0,
        borderRadius: 14,
        padding: '12px 14px',
        textAlign: 'left',
        cursor: 'pointer',
        color: '#dfe7f5',
        background: 'transparent',
    },
    navButtonActive: {
        background: '#2563eb',
        color: '#fff',
        boxShadow: '0 14px 30px rgba(37,99,235,0.28)',
    },
    navLabel: {
        display: 'block',
        fontWeight: 700,
        fontSize: 14,
    },
    navDesc: {
        display: 'block',
        marginTop: 3,
        fontSize: 12,
        lineHeight: 1.35,
        opacity: 0.75,
    },
    tokenBox: {
        marginTop: 'auto',
        padding: 14,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.08)',
    },
    tokenLabel: {
        fontSize: 12,
        color: '#b8c2d6',
        marginBottom: 8,
    },
    tokenInput: {
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(0,0,0,0.28)',
        color: '#fff',
        padding: '10px 11px',
        outline: 'none',
    },
    content: {
        padding: 28,
        overflow: 'auto',
    },
};

function renderPage(page: PageKey) {
    switch (page) {
        case 'dashboard':
            return <Dashboard/>;
        case 'vehicle-selection':
            return <VehicleSelection/>;
        case 'engine':
            return <EngineControl/>;
        case 'pairing':
            return <Pairing/>;
        case 'clients':
            return <Clients/>;
        case 'logs':
            return <DebugLogs/>;
        case 'settings':
            return <Settings/>;
        default:
            return <Dashboard/>;
    }
}

export default function App() {
    const [page, setPage] = useState<PageKey>('dashboard');
    const [sessionReady, setSessionReady] = useState(false);
    const [sessionError, setSessionError] = useState('');

    useEffect(() => {
        bootstrapAdminSession()
            .then(() => setSessionReady(true))
            .catch((error: Error) => setSessionError(error.message));
    }, []);

    if (sessionError) {
        return <div>Local Admin Console could not be started: {sessionError}</div>;
    }

    if (!sessionReady) {
        return <div>Starting secure local console...</div>;
    }

    return (
        <main style={styles.shell}>
            <aside style={styles.sidebar}>
                <div style={styles.brand}>
                    <h1 style={styles.brandTitle}>Diagnostic Engine Console</h1>
                    <p style={styles.brandSub}>
                        React Admin Console for local bridge status, engine-control testing,
                        pairing, and debug operations.
                    </p>
                </div>

                <nav style={styles.nav}>
                    {pages.map((item) => {
                        const active = item.key === page;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setPage(item.key)}
                                style={{
                                    ...styles.navButton,
                                    ...(active ? styles.navButtonActive : {}),
                                }}
                            >
                                <span style={styles.navLabel}>{item.label}</span>
                                <span style={styles.navDesc}>{item.description}</span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <section style={styles.content}>{renderPage(page)}</section>
        </main>
    );
}
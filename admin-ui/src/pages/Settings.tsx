import React, {useState} from 'react';
import {clearAdminToken, getAdminToken, setAdminToken,} from '../api/bridgeClient';

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

const dangerButton: React.CSSProperties = {
    ...button,
    background: '#dc2626',
};

const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    outline: 'none',
};

export default function Settings() {
    const [token, setToken] = useState(getAdminToken());
    const [saved, setSaved] = useState(false);

    function saveToken() {
        setAdminToken(token);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
    }

    function clearToken() {
        clearAdminToken();
        setToken('');
        setSaved(false);
    }

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Settings</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    Local admin UI settings. Runtime bridge config is still controlled by .env.
                </p>
            </header>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
                <section style={card}>
                    <h3 style={{marginTop: 0}}>Admin Token</h3>
                    <p style={{color: '#64748b', fontSize: 13}}>
                        This token is stored in browser localStorage and used as Bearer auth
                        for Bridge Service admin APIs.
                    </p>

                    <input
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        placeholder="Paste admin token"
                        style={input}
                    />

                    <div style={{display: 'flex', gap: 10, marginTop: 12}}>
                        <button type="button" style={button} onClick={saveToken}>
                            Save Token
                        </button>
                        <button type="button" style={dangerButton} onClick={clearToken}>
                            Clear
                        </button>
                    </div>

                    {saved && (
                        <p style={{color: '#166534', fontWeight: 700}}>Saved successfully.
                        </p>
                    )}
                </section>

                <section style={card}>
                    <h3 style={{marginTop: 0}}>Runtime Commands</h3>
                    <p style={{color: '#64748b', fontSize: 13}}>
                        During development, run the Desktop Agent and Bridge Service separately.
                    </p>

                    <pre style={preStyle}>
    {`# Terminal 1
python scripts\\run_desktop_agent.py

# Terminal 2
python scripts\\run_bridge.py

# React development
cd admin-ui
npm install
npm run dev

# Production build served at /admin
npm run build
python scripts\\run_bridge.py`}
    </pre>
                </section>

                <section style={card}>
                    <h3 style={{marginTop: 0}}>Architecture Rule</h3>
                    <pre style={preStyle}>
    {`React Admin UI
  ↓ calls only
Bridge Service :8090
  ↓ calls only when automation needed
Desktop Agent :8091
  ↓ pywinauto
Autocom Cars CDP+ visible window`}
    </pre>
                </section>

                <section style={card}>
                    <h3 style={{marginTop: 0}}>Next UI Targets</h3>
                    <ul style={{color: '#334155', lineHeight: 1.8}}>
                        <li>Live diagnostic event stream viewer</li>
                        <li>Better screen text search/filter</li>
                        <li>Clickable UI text list</li>
                        <li>Logs page</li>
                        <li>Installer shortcut opening /admin</li>
                    </ul>
                </section>
            </div>
        </div>
    )

}

const preStyle: React.CSSProperties = {
    margin: 0,
    padding: 14,
    borderRadius: 14,
    background: '#0f172a',
    color: '#dbeafe',
    overflow: 'auto',
    fontSize: 12,
    lineHeight: 1.6,
};
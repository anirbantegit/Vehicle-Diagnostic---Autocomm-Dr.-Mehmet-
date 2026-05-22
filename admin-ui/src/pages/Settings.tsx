import React from 'react';

const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e6eaf2',
};

export default function Settings() {

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
                    <h3 style={{marginTop: 0}}>Local Console Security</h3>
                    <p style={{color: '#64748b', fontSize: 13}}>
                        Administrator authentication is generated and managed locally by the
                        service. No credential entry or copying is required.
                    </p>
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
                    <h3 style={{marginTop: 0}}>Runtime Architecture</h3>
                    <pre style={preStyle}>
    {`React Admin UI
  ↓ calls only
Bridge Service :8090
  ↓ calls only when automation needed
Desktop Agent :8091
  ↓ pywinauto
Detected Diagnostic Engine window`}
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
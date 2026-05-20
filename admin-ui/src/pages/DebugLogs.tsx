import React, {useEffect, useMemo, useState} from 'react';
import {
    ActionLogEntry,
    clearActionLogs,
    downloadActionLogs,
    getActionLogs,
    subscribeActionLogs,
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

const secondaryButton: React.CSSProperties = {
    ...button,
    background: '#e2e8f0',
    color: '#0f172a',
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

function levelStyle(level: ActionLogEntry['level']): React.CSSProperties {
    if (level === 'error') {
        return {background: '#fee2e2', color: '#991b1b'};
    }
    if (level === 'success') {
        return {background: '#dcfce7', color: '#166534'};
    }
    if (level === 'event') {
        return {background: '#dbeafe', color: '#1d4ed8'};
    }
    return {background: '#e2e8f0', color: '#334155'};
}

function safePreview(value: unknown): string {
    if (value === undefined) {
        return '';
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export default function DebugLogs() {
    const [logs, setLogs] = useState<ActionLogEntry[]>(getActionLogs());
    const [filter, setFilter] = useState('');
    const [selected, setSelected] = useState<ActionLogEntry | null>(logs[0] || null);

    useEffect(() => {
        return subscribeActionLogs((nextLogs) => {
            setLogs(nextLogs);
            setSelected((current) => current || nextLogs[0] || null);
        });
    }, []);

    const filteredLogs = useMemo(() => {
        const keyword = filter.trim().toLowerCase();
        if (!keyword) {
            return logs;
        }

        return logs.filter((log) =>
            [
                log.timestamp,
                log.level,
                log.source,
                log.action,
                log.method,
                log.path,
                log.error,
                safePreview(log.request),
                safePreview(log.response),
            ]
                .join(' ')
                .toLowerCase()
                .includes(keyword),
        );
    }, [filter, logs]);

    function handleClear() {
        clearActionLogs();
        setSelected(null);
    }

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Super Logs</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    Captures admin actions, Bridge responses, errors, and diagnostic WebSocket events. Export this JSON when sharing debug data.
                </p>
            </header>

            <section style={{...card, marginBottom: 16}}>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'}}>
                    <button type="button" style={button} onClick={downloadActionLogs}>
                        Export Debug JSON
                    </button>
                    <button type="button" style={dangerButton} onClick={handleClear}>
                        Clear Logs
                    </button>
                    <button type="button" style={secondaryButton} onClick={() => setLogs(getActionLogs())}>
                        Refresh
                    </button>
                    <input
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Filter logs by path, action, response, error..."
                        style={{...input, flex: 1, minWidth: 260}}
                    />
                </div>
            </section>

            <div style={{display: 'grid', gridTemplateColumns: '460px 1fr', gap: 18, alignItems: 'start'}}>
                <section style={card}>
                    <h3 style={{marginTop: 0}}>Log Entries ({filteredLogs.length})</h3>

                    <div style={{display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 650, overflow: 'auto'}}>
                        {filteredLogs.length === 0 && (
                            <p style={{color: '#64748b'}}>No logs yet. Use the admin actions first.</p>
                        )}

                        {filteredLogs.map((log) => (
                            <button
                                key={log.id}
                                type="button"
                                onClick={() => setSelected(log)}
                                style={{
                                    border: selected?.id === log.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    borderRadius: 14,
                                    background: '#fff',
                                    padding: 12,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{display: 'flex', justifyContent: 'space-between', gap: 10}}>
                                    <strong>{log.action}</strong>
                                    <span
                                        style={{
                                            ...levelStyle(log.level),
                                            borderRadius: 999,
                                            padding: '3px 8px',
                                            fontSize: 11,
                                            fontWeight: 800,
                                        }}
                                    >
                                        {log.level}
                                    </span>
                                </div>
                                <div style={{color: '#64748b', fontSize: 12, marginTop: 4}}>
                                    {log.method ? `${log.method} ` : ''}{log.path || log.source}
                                </div>
                                <div style={{color: '#94a3b8', fontSize: 11, marginTop: 4}}>
                                    {log.timestamp}
                                    {typeof log.duration_ms === 'number' ? ` · ${log.duration_ms}ms` : ''}
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <section style={card}>
                    <h3 style={{marginTop: 0}}>Selected Log Detail</h3>
                    <pre
                        style={{
                            margin: 0,
                            padding: 16,
                            borderRadius: 16,
                            background: '#0f172a',
                            color: '#dbeafe',
                            overflow: 'auto',
                            minHeight: 520,
                            maxHeight: 760,
                            fontSize: 12,
                        }}
                    >
                        {selected ? JSON.stringify(selected, null, 2) : 'No log selected.'}
                    </pre>
                </section>
            </div>
        </div>
    );
}
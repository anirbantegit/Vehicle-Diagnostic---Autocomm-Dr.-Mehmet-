import React, {useState} from 'react';
import {
    connectSignalr,
    disconnectSignalr,
    getAgentStatus,
    getBridgeStatus,
    getScreenTexts,
    getSignalrStatus,
    runDiagnosis,
    searchVci,
    sendSignalr,
    startGenericObd,
    testVci,
} from '../api/bridgeClient';

const panel: React.CSSProperties = {
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

function JsonOutput({value}: { value: unknown }) {
    return (
        <pre
            style={{
                margin: 0,
                padding: 16,
                borderRadius: 16,
                background: '#0f172a',
                color: '#dbeafe',
                overflow: 'auto',
                minHeight: 260,
                maxHeight: 560,
                fontSize: 12,
            }}
        >
    {JSON.stringify(value, null, 2)}
    </pre>
    );
}

export default function EngineControl() {
    const [busy, setBusy] = useState('');
    const [output, setOutput] = useState<unknown>({
        message: 'Use the controls to verify engine-level Autocom control.',
    });
    const [error, setError] = useState('');
    const [signalEvent, setSignalEvent] = useState('runDiagnosis');
    const [signalData, setSignalData] = useState('{}');
    const [functionName, setFunctionName] = useState('');
    const [vehicleIds, setVehicleIds] = useState('');
    const [protocol, setProtocol] = useState('');

    async function runAction(label: string, action: () => Promise<unknown>) {
        setBusy(label);
        setError('');
        try {
            const result = await action();
            setOutput(result);
        } catch (exc) {
            const message = exc instanceof Error ? exc.message : String(exc);
            setError(message);
            setOutput({error: message});
        } finally {
            setBusy('');
        }
    }

    function parseJsonInput(value: string): unknown {
        if (!value.trim()) {
            return null;
        }
        return JSON.parse(value);
    }

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Engine Control</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    First target: prove Bridge → Desktop Agent → Autocom control before mobile UI.
                </p>
            </header>

            {error && (
                <div
                    style={{
                        ...panel,
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

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '420px 1fr',
                    gap: 18,
                    alignItems: 'start',
                }}
            >
                <section style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                    <div style={panel}>
                        <h3 style={{marginTop: 0}}>Bridge / Agent Checks</h3>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('bridge-status', getBridgeStatus)}
                            >
                                Bridge Status
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('agent-status', getAgentStatus)}
                            >
                                Agent Status
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('screen-texts', getScreenTexts)}
                            >
                                Screen Texts
                            </button>
                        </div>
                    </div>

                    <div style={panel}>
                        <h3 style={{marginTop: 0}}>Generic OBD / VCI</h3>
                        <p style={{color: '#64748b', fontSize: 13}}>
                            Use this to verify the real Autocom UI automation path.
                        </p>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
                            <button
                                type="button"
                                style={button}
                                onClick={() => runAction('generic-obd', startGenericObd)}
                            >
                                Start Generic OBD
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('search-vci', searchVci)}
                            >
                                Search VCI
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('test-vci', testVci)}
                            >
                                Test VCI
                            </button>
                        </div>
                    </div>

                    <div style={panel}>
                        <h3 style={{marginTop: 0}}>SignalR Runtime</h3>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14}}>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() => runAction('signalr-status', getSignalrStatus)}
                            >
                                Status
                            </button>
                            <button
                                type="button"
                                style={button}
                                onClick={() => runAction('signalr-connect', connectSignalr)}
                            >
                                Connect
                            </button>
                            <button
                                type="button"
                                style={dangerButton}
                                onClick={() => runAction('signalr-disconnect', disconnectSignalr)}
                            >
                                Disconnect
                            </button>
                        </div>

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Event
                        </label>
                        <input
                            value={signalEvent}
                            onChange={(event) => setSignalEvent(event.target.value)}
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Data JSON
                        </label>
                        <textarea
                            value={signalData}
                            onChange={(event) => setSignalData(event.target.value)}
                            rows={5}
                            style={{...input, resize: 'vertical', fontFamily: 'monospace'}}
                        />

                        <button
                            type="button"
                            style={{...button, marginTop: 10}}
                            onClick={() =>
                                runAction('signalr-send', () =>
                                    sendSignalr({
                                        event: signalEvent,
                                        data: parseJsonInput(signalData),
                                    }),
                                )
                            }
                        >
                            Send SignalR Event
                        </button>
                    </div>

                    <div style={panel}>
                        <h3 style={{marginTop: 0}}>Run Diagnosis</h3>

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Function name
                        </label>
                        <input
                            value={functionName}
                            onChange={(event) => setFunctionName(event.target.value)}
                            placeholder="Example: readFaultCodes"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Vehicle IDs, comma-separated
                        </label>
                        <input
                            value={vehicleIds}
                            onChange={(event) => setVehicleIds(event.target.value)}
                            placeholder="Example: 12345,67890"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Protocol
                        </label>
                        <input
                            value={protocol}
                            onChange={(event) => setProtocol(event.target.value)}
                            placeholder="Optional"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <button
                            type="button"
                            style={button}
                            onClick={() =>
                                runAction('run-diagnosis', () =>
                                    runDiagnosis({
                                        function_name: functionName,
                                        vehicle_ids: vehicleIds
                                            .split(',')
                                            .map((item) => item.trim())
                                            .filter(Boolean),
                                        protocol: protocol.trim() || null,
                                        data: null,
                                    }),
                                )
                            }
                        >
                            Run Diagnosis
                        </button>
                    </div>
                </section>

                <section style={panel}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h3 style={{margin: 0}}>Output</h3>
                        <span style={{color: '#64748b', fontSize: 13}}>
    {busy ? `Running: ${busy}` : 'Ready'}
    </span>
                    </div>
                    <JsonOutput value={output}/>
                </section>
            </div>
        </div>
    )

}
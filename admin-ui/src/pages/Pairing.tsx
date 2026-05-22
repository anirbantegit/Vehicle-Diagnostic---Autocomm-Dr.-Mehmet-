import React, {useEffect, useState} from 'react';
import {QRCodeCanvas} from 'qrcode.react';
import {
    BridgeIdentity,
    getPairingStatus,
    getPublicIdentity,
    PairingStartResponse,
    startPairing,
} from '../api/bridgeClient';
import {redactDisplayValue} from '../utils/redactDisplay';

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

function JsonBlock({value}: { value: unknown }) {
    return (
        <pre
            style={{
                margin: 0,
                padding: 14,
                borderRadius: 14,
                background: '#0f172a',
                color: '#dbeafe',
                overflow: 'auto',
                fontSize: 12,
            }}
        >
      {JSON.stringify(redactDisplayValue(value), null, 2)}
    </pre>
    );
}

export default function Pairing() {
    const [identity, setIdentity] = useState<BridgeIdentity | null>(null);
    const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
    const [pairingStatus, setPairingStatus] = useState<'idle' | 'pending' | 'claimed' | 'expired'>('idle');
    const [error, setError] = useState('');

    async function loadIdentity() {
        try {
            setIdentity(await getPublicIdentity());
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : String(exc));
        }
    }

    async function handleStartPairing() {
        setError('');
        try {
            const result = await startPairing();
            setPairing(result);
            setPairingStatus('pending');
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : String(exc));
        }
    }

    useEffect(() => {
        if (!pairing || pairingStatus !== 'pending') {
            return;
        }

        let cancelled = false;

        const pollStatus = async () => {
            try {
                const status = await getPairingStatus(pairing.pairing_id);
                if (!cancelled) {
                    setPairingStatus(status.status);
                }
            } catch (exc) {
                if (!cancelled) {
                    setError(exc instanceof Error ? exc.message : String(exc));
                }
            }
        };

        void pollStatus();
        const timer = window.setInterval(() => {
            void pollStatus();
        }, 1500);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [pairing, pairingStatus]);

    useEffect(() => {
        loadIdentity();
    }, []);

    const qrText = pairing ? JSON.stringify(pairing.qr_payload) : '';

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Pairing</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    Generate a short-lived QR payload for mobile/web clients.
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
            )}

            <div style={{display: 'grid', gridTemplateColumns: '1fr 420px', gap: 18}}>
                <section style={card}>
                    <h3 style={{marginTop: 0}}>Device Identity</h3>
                    <JsonBlock value={identity || {message: 'Loading identity...'}}/>
                </section>

                <section style={card}>
                    <h3 style={{marginTop: 0}}>QR Pairing</h3>
                    <p style={{color: '#64748b', fontSize: 13}}>
                        Pairing expires quickly. Use this only while the technician is present.
                    </p>
                    <p>
                        Pairing status: <strong>{pairingStatus}</strong>
                    </p>
                    <button type="button" onClick={handleStartPairing} style={button}>
                        Generate Pairing QR
                    </button>

                    {pairing && (
                        <div style={{marginTop: 18}}>
                            <div
                                style={{
                                    display: 'inline-block',
                                    background: '#fff',
                                    padding: 14,
                                    borderRadius: 18,
                                    border: '1px solid #e2e8f0',
                                }}
                            >
                                <QRCodeCanvas value={qrText} size={240} marginSize={10}/>
                            </div>

                            <p style={{color: '#64748b', fontSize: 13}}>
                                Expires at: <strong>{pairing.expires_at}</strong>
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
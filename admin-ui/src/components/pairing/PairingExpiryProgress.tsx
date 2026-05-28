import {useEffect, useRef, useState} from 'react';

type PairingExpiryProgressProps = {
    active: boolean;
    expiresAt: string;
    expiresInSeconds: number;
    refreshing: boolean;
    onExpired: () => void;
};

const formatSeconds = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}:${String(remainingSeconds).padStart(2, '0')}` : `${remainingSeconds}s`;
};

export const PairingExpiryProgress = ({
    active,
    expiresAt,
    expiresInSeconds,
    refreshing,
    onExpired,
}: PairingExpiryProgressProps) => {
    const [nowMs, setNowMs] = useState(() => Date.now());
    const expiredTokenRef = useRef('');
    const expiryMs = new Date(expiresAt).getTime();
    const totalMs = Math.max(1000, expiresInSeconds * 1000);
    const remainingMs = active && Number.isFinite(expiryMs) ? Math.max(0, expiryMs - nowMs) : 0;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const percentage = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
    const indicatorColor = remainingSeconds <= 15 ? '#dc2626' : remainingSeconds <= 35 ? '#f59e0b' : '#2563eb';

    useEffect(() => {
        expiredTokenRef.current = '';
        setNowMs(Date.now());
    }, [expiresAt]);

    useEffect(() => {
        if (!active) {
            return undefined;
        }

        const update = () => {
            const currentTime = Date.now();
            setNowMs(currentTime);
            if (
                Number.isFinite(expiryMs)
                && expiryMs <= currentTime
                && document.visibilityState === 'visible'
                && expiredTokenRef.current !== expiresAt
            ) {
                expiredTokenRef.current = expiresAt;
                onExpired();
            }
        };

        update();
        const timer = window.setInterval(update, 250);
        document.addEventListener('visibilitychange', update);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', update);
        };
    }, [active, expiresAt, expiryMs, onExpired]);

    return (
        <div style={{marginTop: 14, textAlign: 'left'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#64748b', marginBottom: 7}}>
                <span>{refreshing ? 'Refreshing expired QR...' : 'Auto-refresh in'}</span>
                <strong style={{color: refreshing ? '#2563eb' : indicatorColor}}>
                    {refreshing ? 'Renewing' : formatSeconds(remainingSeconds)}
                </strong>
            </div>
            <div aria-label="Pairing QR expiry countdown" style={{height: 7, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0'}}>
                <div
                    style={{
                        width: `${refreshing ? 100 : percentage}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: refreshing ? '#93c5fd' : indicatorColor,
                        transition: 'width 250ms linear, background 180ms ease',
                    }}
                />
            </div>
        </div>
    );
};

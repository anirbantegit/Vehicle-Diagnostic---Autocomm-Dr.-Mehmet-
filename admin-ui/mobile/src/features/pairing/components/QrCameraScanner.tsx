import {useCallback, useEffect, useRef, useState, type ChangeEvent} from 'react';
import QrScanner from 'qr-scanner';
import {errorMessage} from '../../../utils/mobileFormatters';
import {decodePairingQrImage} from '../qrDecoder';

type QrCameraScannerProps = {
    disabled: boolean;
    onDecoded: (pairingValue: string) => Promise<void>;
    onError: (message: string) => void;
    onStatus: (message: string) => void;
};

const DETECTED_OUTLINE_DELAY_MS = 360;

const hasLiveCameraSupport = (): boolean => (
    window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'
);

const cameraErrorMessage = (reason: unknown): string => {
    if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        return 'Camera access was declined. Allow camera permission and try again.';
    }
    if (reason instanceof DOMException && reason.name === 'NotFoundError') {
        return 'No usable rear camera was found on this device.';
    }
    return 'The live camera could not be opened. Check camera permission and use an HTTPS mobile portal.';
};

export const QrCameraScanner = ({disabled, onDecoded, onError, onStatus}: QrCameraScannerProps) => {
    const captureInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const scannerRef = useRef<QrScanner | null>(null);
    const detectedTimerRef = useRef<number | null>(null);
    const detectionLockedRef = useRef(false);
    const [readingCapture, setReadingCapture] = useState(false);
    const [liveScannerOpen, setLiveScannerOpen] = useState(false);
    const [detected, setDetected] = useState(false);
    const canScanLive = hasLiveCameraSupport();
    const locked = disabled || readingCapture;

    const stopLiveScanner = useCallback(() => {
        if (detectedTimerRef.current !== null) {
            window.clearTimeout(detectedTimerRef.current);
            detectedTimerRef.current = null;
        }
        scannerRef.current?.destroy();
        scannerRef.current = null;
    }, []);

    const closeLiveScanner = useCallback(() => {
        stopLiveScanner();
        setLiveScannerOpen(false);
        setDetected(false);
        detectionLockedRef.current = false;
    }, [stopLiveScanner]);

    const cancelLiveScanner = useCallback(() => {
        closeLiveScanner();
        onStatus('');
    }, [closeLiveScanner, onStatus]);

    const completeLiveMatch = useCallback((rawValue: string) => {
        if (detectionLockedRef.current) {
            return;
        }
        detectionLockedRef.current = true;
        setDetected(true);
        onStatus('QR detected. Pairing this device...');
        scannerRef.current?.stop();
        detectedTimerRef.current = window.setTimeout(() => {
            closeLiveScanner();
            void onDecoded(rawValue);
        }, DETECTED_OUTLINE_DELAY_MS);
    }, [closeLiveScanner, onDecoded, onStatus]);

    useEffect(() => {
        if (!liveScannerOpen) {
            return undefined;
        }
        const video = videoRef.current;
        const overlay = overlayRef.current;
        if (!video || !overlay) {
            closeLiveScanner();
            onError('The camera preview could not be prepared.');
            return undefined;
        }

        const scanner = new QrScanner(
            video,
            (result) => completeLiveMatch(result.data),
            {
                preferredCamera: 'environment',
                maxScansPerSecond: 12,
                highlightScanRegion: true,
                highlightCodeOutline: true,
                overlay,
                returnDetailedScanResult: true,
                onDecodeError: () => undefined,
            },
        );
        scanner.setInversionMode('both');
        scannerRef.current = scanner;
        onStatus('Opening rear camera...');
        void scanner.start()
            .then(() => onStatus('Point your camera at the pairing QR code.'))
            .catch((reason) => {
                closeLiveScanner();
                onError(cameraErrorMessage(reason));
            });

        return () => stopLiveScanner();
    }, [closeLiveScanner, completeLiveMatch, liveScannerOpen, onError, onStatus, stopLiveScanner]);

    useEffect(() => {
        if (disabled && liveScannerOpen) {
            closeLiveScanner();
        }
    }, [closeLiveScanner, disabled, liveScannerOpen]);

    const openLiveScanner = (): void => {
        detectionLockedRef.current = false;
        setDetected(false);
        setLiveScannerOpen(true);
    };

    const captureFromCamera = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) {
            return;
        }

        setReadingCapture(true);
        onStatus('Reading QR from camera image...');
        try {
            const match = await decodePairingQrImage(file);
            onStatus('QR detected. Pairing this device...');
            await onDecoded(match.rawValue);
        } catch (reason) {
            onError(errorMessage(reason));
        } finally {
            setReadingCapture(false);
        }
    };

    return (
        <>
            {canScanLive ? (
                <>
                    <button
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={locked}
                        type="button"
                        onClick={openLiveScanner}
                    >
                        <span aria-hidden="true">▣</span>{locked ? 'Processing QR...' : 'Scan QR live with camera'}
                    </button>
                    <label className={`mt-3 flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 ${locked ? 'cursor-not-allowed opacity-60' : ''}`}>
                        Scan saved QR image instead
                        <input ref={captureInputRef} accept="image/*" capture="environment" className="sr-only" disabled={locked} type="file" onChange={(event) => void captureFromCamera(event)}/>
                    </label>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                        Keep the QR inside the frame. It is outlined as soon as it is detected, then pairing starts automatically.
                    </p>
                </>
            ) : (
                <>
                    <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                        Live camera scanning needs the mobile portal to open over HTTPS. This page is on HTTP, so browsers block a WhatsApp-style live camera stream.
                    </div>
                    <label className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 ${locked ? 'cursor-not-allowed opacity-60' : ''}`}>
                        <span aria-hidden="true">▣</span>{locked ? 'Processing QR...' : 'Capture or select QR image'}
                        <input ref={captureInputRef} accept="image/*" capture="environment" className="sr-only" disabled={locked} type="file" onChange={(event) => void captureFromCamera(event)}/>
                    </label>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                        Still-image scanning works on HTTP and is now decoded through the production QR scanner engine.
                    </p>
                </>
            )}
            {liveScannerOpen && (
                <div aria-label="QR camera scanner" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-5" role="dialog">
                    <section className="mobile-dark-card w-full max-w-md rounded-[2rem] border p-5 shadow-2xl">
                        <p className="text-sm font-semibold text-white">Point camera at the QR code</p>
                        <div className="relative mt-4 overflow-hidden rounded-3xl border border-cyan-400/30 bg-black">
                            <video ref={videoRef} autoPlay className="aspect-square w-full object-cover" muted playsInline/>
                            <div ref={overlayRef} className="qr-camera-overlay pointer-events-none absolute inset-0"/>
                            {detected && <div className="absolute inset-x-0 bottom-0 z-10 bg-cyan-400/90 px-3 py-2 text-center text-xs font-bold text-slate-950">QR detected — connecting</div>}
                        </div>
                        <button className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10" type="button" onClick={cancelLiveScanner}>
                            Cancel scan
                        </button>
                    </section>
                </div>
            )}
        </>
    );
};

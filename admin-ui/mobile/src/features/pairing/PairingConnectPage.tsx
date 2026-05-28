import {useCallback, useState} from 'react';
import {useNavigate} from 'react-router';
import {useAppDispatch} from '../../app/hooks';
import {BrandHeader} from '../../components/ui/BrandHeader';
import {useClaimPairingMutation} from '../../services/mobileApi';
import {errorMessage} from '../../utils/mobileFormatters';
import {setAuthenticated} from '../session/mobileSessionSlice';
import {QrCameraScanner} from './components/QrCameraScanner';
import {pairingCredentialsFromLink} from './qrDecoder';

export const PairingConnectPage = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [claimPairing] = useClaimPairingMutation();
    const [pairingLink, setPairingLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const connectFromLink = useCallback(async (rawLink: string): Promise<void> => {
        setBusy(true);
        setError('');
        setStatus('Claiming pairing session...');
        try {
            await claimPairing(pairingCredentialsFromLink(rawLink)).unwrap();
            setStatus('Paired. Opening Vehicle Selection...');
            dispatch(setAuthenticated(true));
            navigate('/vehicles', {replace: true});
        } catch (reason) {
            setStatus('');
            setError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    }, [claimPairing, dispatch, navigate]);

    const connectScannedLink = useCallback(async (decodedLink: string): Promise<void> => {
        setPairingLink(decodedLink);
        await connectFromLink(decodedLink);
    }, [connectFromLink]);

    const reportScanStatus = useCallback((message: string) => {
        setError('');
        setStatus(message);
    }, []);

    const reportScanError = useCallback((message: string) => {
        setStatus('');
        setError(message);
    }, []);

    return (
        <main className="mobile-shell flex min-h-screen items-center justify-center px-5 py-8 text-slate-100">
            <section className="mobile-dark-card w-full max-w-lg rounded-[2rem] border p-7 shadow-2xl backdrop-blur-xl">
                <BrandHeader status="Not paired" statusClassName="bg-amber-400/15 text-amber-200"/>
                <h1 className="text-3xl font-semibold tracking-tight">Connect your simulator</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                    Scan the pairing QR displayed by the PC console or paste its pairing link to securely connect this device.
                </p>
                {error && <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
                {status && <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">{status}</p>}
                <div className="mt-7 rounded-3xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mobile pairing</p>
                    <QrCameraScanner disabled={busy} onDecoded={connectScannedLink} onError={reportScanError} onStatus={reportScanStatus}/>
                    <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-800"/><span>or paste pairing link</span><span className="h-px flex-1 bg-slate-800"/></div>
                    <textarea
                        className="min-h-24 w-full resize-none rounded-2xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                        disabled={busy}
                        placeholder="http://.../mobile/pair?pairing_id=...&pairing_secret=..."
                        value={pairingLink}
                        onChange={(event) => setPairingLink(event.target.value)}
                    />
                    <button className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !pairingLink.trim()} type="button" onClick={() => void connectFromLink(pairingLink)}>
                        Connect device
                    </button>
                </div>
                <p className="mt-5 text-xs leading-5 text-slate-500">Pairing QR codes expire quickly and can be claimed only once. QR camera captures are decoded locally in this browser, including on LAN HTTP connections.</p>
            </section>
        </main>
    );
};

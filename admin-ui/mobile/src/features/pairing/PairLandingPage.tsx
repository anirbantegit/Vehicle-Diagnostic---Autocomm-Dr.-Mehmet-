import {useEffect, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router';
import {useAppDispatch} from '../../app/hooks';
import {BrandHeader} from '../../components/ui/BrandHeader';
import {setAuthenticated} from '../session/mobileSessionSlice';
import {useClaimPairingMutation} from '../../services/mobileApi';
import {errorMessage} from '../../utils/mobileFormatters';

export const PairLandingPage = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [claimPairing] = useClaimPairingMutation();
    const [state, setState] = useState('Verifying QR pairing...');
    const [error, setError] = useState('');

    useEffect(() => {
        const pairingId = searchParams.get('pairing_id') || '';
        const pairingSecret = searchParams.get('pairing_secret') || '';
        if (!pairingId || !pairingSecret) {
            setError('The pairing link is incomplete. Generate a fresh QR code from the PC console.');
            return;
        }
        let cancelled = false;
        void claimPairing({pairingId, pairingSecret}).unwrap()
            .then(() => {
                if (!cancelled) {
                    setState('Phone paired. Opening Vehicle Selection...');
                    dispatch(setAuthenticated(true));
                    navigate('/vehicles', {replace: true});
                }
            })
            .catch((reason) => {
                if (!cancelled) {
                    setError(errorMessage(reason));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [claimPairing, dispatch, navigate, searchParams]);

    return (
        <main className="mobile-shell flex min-h-screen items-center justify-center px-5 text-slate-100">
            <section className="mobile-dark-card w-full max-w-md overflow-hidden rounded-[2rem] border p-7 shadow-2xl backdrop-blur">
                <BrandHeader/>
                <h1 className="text-2xl font-semibold tracking-tight">Pair device</h1>
                {error ? (
                    <>
                        <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>
                        <p className="mt-4 text-sm text-slate-400">Return to the PC console and generate a fresh QR code.</p>
                    </>
                ) : (
                    <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">{state}</p>
                )}
            </section>
        </main>
    );
};

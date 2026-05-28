import type {MobileSession} from '../../../mobileClient';
import {ThemeToggle} from '../../../components/ui/ThemeToggle';

type MobilePortalHeaderProps = {
    session: MobileSession | null;
    eventStatus: string;
    onDisconnect: () => void;
};

export const MobilePortalHeader = ({session, eventStatus, onDisconnect}: MobilePortalHeaderProps) => (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 font-black text-slate-950 shadow-lg shadow-cyan-900/30">D</span>
                <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-300">Diagnostic Engine Console</p>
                    <p className="truncate text-sm text-slate-300">Mobile Simulator · {session?.device.device_name || 'Connected PC'}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <ThemeToggle/>
                <span className={`hidden rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${session?.engine.local_api_reachable ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                    ● {session?.engine.local_api_reachable ? 'Engine online' : 'Engine unavailable'}
                </span>
                <span className={`hidden rounded-full px-3 py-1.5 text-xs font-semibold md:inline-flex ${eventStatus === 'Live' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>
                    Events: {eventStatus}
                </span>
                <button className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10" type="button" onClick={onDisconnect}>Disconnect</button>
            </div>
        </div>
    </header>
);

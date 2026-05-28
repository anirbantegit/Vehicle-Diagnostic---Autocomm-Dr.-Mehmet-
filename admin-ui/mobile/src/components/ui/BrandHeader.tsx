import {ThemeToggle} from './ThemeToggle';

type BrandHeaderProps = {
    status?: string;
    statusClassName?: string;
};

export const BrandHeader = ({status, statusClassName = 'bg-cyan-400/10 text-cyan-200'}: BrandHeaderProps) => (
    <div className="mb-7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-bold text-slate-950">D</span>
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Diagnostic Engine</p>
                <p className="font-semibold text-white">Console Emulator</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <ThemeToggle/>
            {status && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClassName}`}>{status}</span>}
        </div>
    </div>
);

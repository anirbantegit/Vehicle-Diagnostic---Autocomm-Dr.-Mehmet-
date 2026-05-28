type VehicleNavigationRailProps = {
    onReset: () => void;
};

export const VehicleNavigationRail = ({onReset}: VehicleNavigationRailProps) => (
    <aside className="hidden rounded-[1.75rem] border border-white/10 bg-slate-900/65 p-3 lg:flex lg:flex-col lg:items-center lg:gap-3">
        <span className="mt-2 flex size-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-xl text-cyan-300">⌂</span>
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-lg text-slate-500">▦</span>
        <span className="mt-auto flex size-12 items-center justify-center rounded-2xl bg-white/5 text-lg text-slate-500">?</span>
        <button className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-xl text-rose-300 hover:bg-rose-500/20" type="button" onClick={onReset} title="Reset vehicle selection">↻</button>
    </aside>
);

import {EmptyState} from '../../../components/ui/EmptyState';
import type {VehicleListType, VehicleSelectionItem, VinHistoryItem} from '../../../mobileClient';
import {
    formatVin,
    itemLabel,
    selectionSteps,
    type SelectionNode,
    type SelectionSource,
} from '../../../utils/mobileFormatters';

type VehicleSelectionPanelProps = {
    tab: SelectionSource;
    vinAvailable: boolean;
    path: SelectionNode[];
    done: boolean;
    activeStep: VehicleListType;
    error: string;
    status: string;
    currentStep: {label: string};
    search: string;
    busy: string;
    filteredItems: VehicleSelectionItem[];
    vin: string;
    vinBusy: boolean;
    filteredVinHistory: VinHistoryItem[];
    onTabChange: (tab: SelectionSource) => void;
    onBreadcrumbOpen: (position: number) => void;
    onSearchChange: (value: string) => void;
    onChooseItem: (item: VehicleSelectionItem) => void;
    onVinChange: (value: string) => void;
    onVinResolve: () => void;
    onVinRead: () => void;
    onVinClear: () => void;
    onHistoryRestore: (entry: VinHistoryItem) => void;
};

export const VehicleSelectionPanel = ({
    tab,
    vinAvailable,
    path,
    done,
    activeStep,
    error,
    status,
    currentStep,
    search,
    busy,
    filteredItems,
    vin,
    vinBusy,
    filteredVinHistory,
    onTabChange,
    onBreadcrumbOpen,
    onSearchChange,
    onChooseItem,
    onVinChange,
    onVinResolve,
    onVinRead,
    onVinClear,
    onHistoryRestore,
}: VehicleSelectionPanelProps) => (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="mb-4 rounded-2xl bg-slate-950/60 p-1">
            <div className="grid grid-cols-3 gap-1">
                {(['manual', 'vin', 'history'] as SelectionSource[]).map((mode) => (
                    <button
                        className={`rounded-xl px-3 py-2.5 text-sm font-semibold capitalize transition ${tab === mode ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'} ${(mode !== 'manual' && !vinAvailable) ? 'cursor-not-allowed opacity-40' : ''}`}
                        disabled={mode !== 'manual' && !vinAvailable}
                        key={mode}
                        type="button"
                        onClick={() => onTabChange(mode)}
                    >
                        {mode === 'vin' ? 'VIN' : mode}
                    </button>
                ))}
            </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/30 p-2">
            {selectionSteps.map((step, position) => {
                const selected = path[position];
                const current = !done && step.type === activeStep;
                return selected ? (
                    <button
                        className="rounded-xl bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                        key={step.type}
                        type="button"
                        onClick={() => onBreadcrumbOpen(position)}
                    >
                        {selected.label} <span className="ml-1 text-cyan-500">›</span>
                    </button>
                ) : (
                    <span className={`rounded-xl px-3 py-2 text-xs font-semibold ${current ? 'bg-white/10 text-white' : 'text-slate-600'}`} key={step.type}>{step.label}</span>
                );
            })}
        </div>

        {error && <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
        <div className="mb-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-3 text-sm text-cyan-100">{status}</div>

        {tab === 'manual' && (
            <>
                <label className="relative mb-4 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
                    <input
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/55 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
                        placeholder={done ? 'Vehicle definition completed' : `Search ${currentStep.label}`}
                        disabled={done}
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                    />
                </label>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">{done ? 'Selection complete' : currentStep.label}</h2>
                    {!done && <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">{filteredItems.length} options</span>}
                </div>
                {done ? (
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        Final vehicle definition is active. RTD functions remain available in the workspace.
                    </div>
                ) : busy.startsWith('step-') ? (
                    <EmptyState text="Loading available vehicle choices..."/>
                ) : filteredItems.length === 0 ? (
                    <EmptyState text="No matching choices returned."/>
                ) : (
                    <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                        {filteredItems.map((item) => (
                            <button
                                className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-slate-950/35 px-4 py-3 text-left text-sm font-medium text-slate-100 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40"
                                disabled={Boolean(busy)}
                                key={item.id}
                                type="button"
                                onClick={() => onChooseItem(item)}
                            >
                                <span>{itemLabel(item)}</span>
                                <span className="text-cyan-400">›</span>
                            </button>
                        ))}
                    </div>
                )}
            </>
        )}

        {tab === 'vin' && (
            <div className="space-y-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Vehicle Identification Number</p>
                    <h2 className="mt-1 text-xl font-semibold">Resolve vehicle by VIN</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Enter the WMI prefix or complete VIN. The resolved breadcrumb becomes the same active vehicle context used by manual selection.</p>
                </div>
                <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-4 font-mono text-lg tracking-[0.15em] text-white outline-none placeholder:tracking-normal placeholder:text-slate-600 focus:border-cyan-400"
                    maxLength={19}
                    placeholder="WMI IDENTIFICATION SERIAL"
                    value={vin}
                    onChange={(event) => onVinChange(event.target.value)}
                />
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span>1–3 WMI</span><span>4–11 Identification</span><span>12–17 Serial</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <button className="rounded-2xl bg-cyan-400 px-3 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40" disabled={vinBusy} type="button" onClick={onVinResolve}>Resolve</button>
                    <button className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-40" disabled={vinBusy} type="button" onClick={onVinRead}>Read VIN</button>
                    <button className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-40" disabled={vinBusy} type="button" onClick={onVinClear}>Clear</button>
                </div>
            </div>
        )}

        {tab === 'history' && (
            <div className="space-y-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Recent contexts</p>
                    <h2 className="mt-1 text-xl font-semibold">VIN History</h2>
                </div>
                {filteredVinHistory.length === 0 ? <EmptyState text="No VIN history returned by Diagnostic Engine Console."/> : filteredVinHistory.map((entry) => (
                    <button
                        className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-slate-950/35 px-4 py-3 text-left hover:border-cyan-400/30 hover:bg-cyan-400/10"
                        key={entry.id || entry.name}
                        type="button"
                        onClick={() => onHistoryRestore(entry)}
                    >
                        <div>
                            <p className="font-mono text-sm tracking-wider text-white">{formatVin(entry.name)}</p>
                            <p className="mt-1 text-xs text-slate-500">Tap to restore vehicle context</p>
                        </div>
                        <span className="text-cyan-400">›</span>
                    </button>
                ))}
            </div>
        )}
    </section>
);

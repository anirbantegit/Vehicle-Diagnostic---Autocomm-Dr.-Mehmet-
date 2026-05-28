import {EmptyState} from '../../../components/ui/EmptyState';
import type {DiagnosticFunctionItem} from '../../../mobileClient';
import type {SelectionSource} from '../../../utils/mobileFormatters';
import {FunctionList} from './FunctionList';

type DiagnosticWorkspaceProps = {
    selectionTitle: string;
    workspaceReady: boolean;
    selectionSource: SelectionSource;
    activeVehicleId: string;
    workspaceWarnings: string[];
    guide: unknown;
    capabilities: unknown;
    functions: {obd: DiagnosticFunctionItem[]; rtd: DiagnosticFunctionItem[]};
    rtdBusyKey: string;
    onOpenRtd: (item: DiagnosticFunctionItem) => void;
};

export const DiagnosticWorkspace = ({
    selectionTitle,
    workspaceReady,
    selectionSource,
    activeVehicleId,
    workspaceWarnings,
    guide,
    capabilities,
    functions,
    rtdBusyKey,
    onOpenRtd,
}: DiagnosticWorkspaceProps) => (
    <section className="space-y-4">
        <div className="rounded-[1.75rem] border border-white/10 bg-white p-4 text-slate-900 shadow-xl shadow-black/10 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Active Vehicle Context</p>
                    <h2 className="mt-1 text-lg font-semibold">{selectionTitle || 'No vehicle selected'}</h2>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${workspaceReady ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {workspaceReady ? `${selectionSource.toUpperCase()} · RTD Ready` : 'Select through Year'}
                </span>
            </div>
            {activeVehicleId && <p className="mb-4 rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-500">Definition ID: {activeVehicleId}</p>}
            {workspaceWarnings.length > 0 && (
                <div className="mb-4 space-y-2">
                    {workspaceWarnings.map((warning) => <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700" key={warning}>{warning}</p>)}
                </div>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Connection Guide</h3>
                    {guide ? (
                        <pre className="max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-cyan-100">{JSON.stringify(guide, null, 2)}</pre>
                    ) : <EmptyState text="Available once Year or a resolved VIN context is active."/>}
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Capabilities</h3>
                    {capabilities ? (
                        <pre className="max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-cyan-100">{JSON.stringify(capabilities, null, 2)}</pre>
                    ) : <EmptyState text="No capability response loaded."/>}
                </div>
            </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[1.75rem] border border-white/10 bg-white p-4 text-slate-900 shadow-xl shadow-black/10 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Supported actions</p>
                        <h3 className="mt-1 text-lg font-semibold">OBD Functions</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{functions.obd.length}</span>
                </div>
                <FunctionList items={functions.obd}/>
            </section>
            <section className="rounded-[1.75rem] border border-cyan-300/30 bg-white p-4 text-slate-900 shadow-xl shadow-cyan-950/10 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-600">Interactive native control</p>
                        <h3 className="mt-1 text-lg font-semibold">Real Time Data</h3>
                    </div>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">{functions.rtd.length}</span>
                </div>
                <FunctionList actionBusy={rtdBusyKey} actionLabel="Open" items={functions.rtd} onAction={onOpenRtd}/>
            </section>
        </div>
    </section>
);

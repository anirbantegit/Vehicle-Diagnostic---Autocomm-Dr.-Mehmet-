import type {DiagnosticFunctionItem, NativePopupState, RtdPopupAction} from '../../../mobileClient';
import {functionLabel} from '../../../utils/mobileFormatters';

const formatPoint = (point?: {x: number; y: number} | null): string => point ? `(${point.x}, ${point.y})` : 'not exposed';

export const NativePopupController = ({
    popup,
    item,
    busy,
    onAction,
    onLocation,
}: {
    popup: NativePopupState;
    item?: DiagnosticFunctionItem | null;
    busy: string;
    onAction: (action: RtdPopupAction) => void;
    onLocation: (location: string) => void;
}) => {
    const actions = popup.available_actions || [];
    const locations = popup.locations || [];
    const identity = popup.popup_identity;
    const canInvoke = (action: RtdPopupAction): boolean => popup.confirmed && actions.includes(action);
    const confirmedClass = popup.confirmed
        ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
        : 'border-amber-100 bg-amber-50 text-amber-800';
    const popupTitle = identity?.function_title || (popup.confirmed && item ? functionLabel(item) : 'Blocking native popup');

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
            <section className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-950/30">
                <header className="flex items-start justify-between bg-slate-950 px-5 py-4 text-white">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Blocking native popup</p>
                        <h2 className="mt-1 text-lg font-semibold">{popupTitle}</h2>
                        {identity?.vehicle_title && <p className="mt-1 text-xs text-slate-300">{identity.vehicle_title}</p>}
                    </div>
                    <button
                        aria-label="Close native popup"
                        className="rounded-full bg-white/10 px-3 py-1 text-lg hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
                        disabled={Boolean(busy) || !canInvoke('cancel')}
                        title={canInvoke('cancel') ? 'Close verified RTD popup' : 'No verified close control is exposed for this popup'}
                        type="button"
                        onClick={() => onAction('cancel')}
                    >
                        ×
                    </button>
                </header>
                <div className="space-y-4 p-5">
                    <div className={`rounded-2xl border p-4 ${confirmedClass}`}>
                        <p className="flex items-center gap-2 text-sm font-semibold">
                            <span className={`size-2 rounded-full ${popup.confirmed ? 'bg-emerald-500' : 'bg-amber-500'}`}/>
                            {popup.confirmed ? 'RTD FormOBDFunction template matched' : 'Unclassified native blocker detected'}
                        </p>
                        <p className="mt-2 text-xs leading-5">{popup.warning || popup.confirmation}</p>
                        {popup.popup_window_handle && <p className="mt-2 font-mono text-[11px]">HWND {popup.popup_window_handle} · {popup.detection_method || 'native detection'}</p>}
                    </div>

                    {!popup.confirmed && (
                        <p className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                            The desktop remains blocked. No automated click is enabled until this modal has a verified detection template.
                        </p>
                    )}

                    {popup.confirmed && (
                        <section>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Location selection</p>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{locations.length} found</span>
                            </div>
                            {locations.length ? (
                                <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2">
                                    {locations.map((location) => {
                                        const active = location.selected === true;
                                        return (
                                            <button
                                                className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${active ? 'border-cyan-400 bg-cyan-50 font-semibold text-cyan-900' : 'border-white bg-white text-slate-700 hover:border-cyan-200'}`}
                                                disabled={Boolean(busy)}
                                                key={`${location.index}-${location.text}`}
                                                type="button"
                                                onClick={() => onLocation(location.text)}
                                            >
                                                <span className="block leading-5">{location.text}</span>
                                                <span className="mt-1 block text-[11px] text-slate-400">Click target {formatPoint(location.click_point)}</span>
                                                {active && <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-cyan-600">Selected in native popup</span>}
                                                {busy === 'location' && <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Refreshing native selection…</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                                    No selectable locations were exposed by <span className="font-mono">listBoxLocations</span>.
                                </p>
                            )}
                        </section>
                    )}

                    {popup.confirmed && (
                        <div className="grid grid-cols-2 gap-2">
                            <button className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-40" disabled={Boolean(busy) || !canInvoke('run')} type="button" onClick={() => onAction('run')}>
                                {busy === 'run' ? 'Starting...' : '▶ Run'}
                            </button>
                            <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40" disabled={Boolean(busy) || !canInvoke('help')} type="button" onClick={() => onAction('help')}>
                                Help
                            </button>
                            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={Boolean(busy) || !canInvoke('select_vehicle')} type="button" onClick={() => onAction('select_vehicle')}>
                                Navigate
                            </button>
                            <button className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40" disabled={Boolean(busy) || !canInvoke('cancel')} type="button" onClick={() => onAction('cancel')}>
                                {busy === 'cancel' ? 'Closing...' : 'Close Popup'}
                            </button>
                        </div>
                    )}
                    {identity?.observed_signature_ids?.length ? (
                        <details className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                            <summary className="cursor-pointer font-semibold">Verified native selectors and click targets</summary>
                            <p className="mt-2 break-all font-mono">{identity.observed_signature_ids.join(' · ')}</p>
                            {Object.entries(popup.action_controls || {}).map(([action, control]) => (
                                <p className="mt-1 font-mono" key={action}>{action}: {control?.automation_id} {formatPoint(control?.click_point)}</p>
                            ))}
                        </details>
                    ) : null}
                </div>
            </section>
        </div>
    );
};

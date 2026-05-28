import type {DiagnosticFunctionItem} from '../../../mobileClient';
import {functionLabel} from '../../../utils/mobileFormatters';
import {EmptyState} from '../../../components/ui/EmptyState';

export const FunctionList = ({
    items,
    actionLabel,
    actionBusy,
    onAction,
}: {
    items: DiagnosticFunctionItem[];
    actionLabel?: string;
    actionBusy?: string;
    onAction?: (item: DiagnosticFunctionItem) => void;
}) => {
    if (!items.length) {
        return <EmptyState text="No functions returned for this selection."/>;
    }

    return (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {items.map((item, index) => {
                const key = `${String(item.id || item.index || index)}`;
                const waiting = actionBusy === key;
                return (
                    <div className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:border-cyan-200 hover:bg-cyan-50/50" key={key}>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{functionLabel(item)}</p>
                            {item.index !== undefined && <p className="text-xs text-slate-400">RTD index {String(item.index)}</p>}
                        </div>
                        {onAction && (
                            <button
                                className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={Boolean(actionBusy)}
                                type="button"
                                onClick={() => onAction(item)}
                            >
                                {waiting ? 'Opening...' : actionLabel}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    activateVehicleContext,
    createDiagnosticsEventSocket,
    DiagnosticCapability,
    DiagnosticEventMessage,
    DiagnosticFunctionItem,
    getVehicleCapabilities,
    getVehicleGuide,
    getVehicleObdFunctions,
    getVehicleRtdFunctions,
    getVehicleSelection,
    getVinAvailable,
    getVinHistory,
    openScanReport,
    openVehicleRtdFunction,
    readVinFromVehicle,
    runDiagnosis,
    selectVehicleByVin,
    VehicleListType,
    VehicleSelectionItem,
    VehicleSelectionResponse,
    viewHelpDocument,
    VinHistoryItem,
} from '../api/bridgeClient';
import {redactDisplayValue} from '../utils/redactDisplay';

type SelectionSource = 'manual' | 'vin';

type SelectedPathItem = {
    listType: VehicleListType;
    id: string;
    label: string;
};

const vehicleSteps: Array<{
    type: VehicleListType;
    breadcrumb: string;
    listLabel: string;
}> = [
    {type: 'brands', breadcrumb: 'Brand', listLabel: 'Brand'},
    {type: 'models', breadcrumb: 'Model', listLabel: 'Model'},
    {type: 'years', breadcrumb: 'Year model', listLabel: 'Year model'},
    {type: 'systemTypes', breadcrumb: 'Type of system', listLabel: 'Type of system'},
    // Recovered Autocom source maps active "system" to the /engines API list.
    {type: 'engines', breadcrumb: 'System', listLabel: 'System'},
    // Recovered Autocom source maps active "name" to the /systems API list.
    {type: 'systems', breadcrumb: 'Name', listLabel: 'Name'},
    {type: 'gearboxes', breadcrumb: 'Gearbox', listLabel: 'Gearbox'},
    {type: 'equipments', breadcrumb: 'Equipment', listLabel: 'Equipment'},
];

const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e6eaf2',
};

const button: React.CSSProperties = {
    border: 0,
    borderRadius: 12,
    padding: '10px 14px',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
};

const secondaryButton: React.CSSProperties = {
    ...button,
    background: '#e2e8f0',
    color: '#0f172a',
};

const dangerButton: React.CSSProperties = {
    ...button,
    background: '#dc2626',
};

const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    outline: 'none',
};

const muted: React.CSSProperties = {
    color: '#64748b',
    fontSize: 13,
};

function JsonOutput({value, minHeight = 140}: {value: unknown; minHeight?: number}) {
    return (
        <pre
            style={{
                margin: 0,
                padding: 14,
                borderRadius: 14,
                background: '#0f172a',
                color: '#dbeafe',
                overflow: 'auto',
                minHeight,
                maxHeight: 320,
                fontSize: 12,
            }}
        >
            {JSON.stringify(redactDisplayValue(value), null, 2)}
        </pre>
    );
}

function itemLabel(item: VehicleSelectionItem): string {
    return item.title || item.name || item.id;
}

function functionLabel(item: DiagnosticFunctionItem): string {
    return item.title || item.name || item.id || `Function ${String(item.index ?? '')}`.trim();
}

function functionIndex(item: DiagnosticFunctionItem): number | null {
    const index = Number(item.index);
    return Number.isInteger(index) ? index : null;
}

function stepIndex(type: VehicleListType): number {
    return vehicleSteps.findIndex((step) => step.type === type);
}

function nextStep(type: VehicleListType): VehicleListType | null {
    return vehicleSteps[stepIndex(type) + 1]?.type ?? null;
}

function stepMeta(type: VehicleListType) {
    return vehicleSteps.find((step) => step.type === type) ?? vehicleSteps[0];
}

function isCapabilityList(value: unknown): value is DiagnosticCapability[] {
    return Array.isArray(value);
}

function isFunctionList(value: unknown): value is DiagnosticFunctionItem[] {
    return Array.isArray(value);
}

function capabilityLabel(capability: DiagnosticCapability): string {
    return capability.text || capability.title || capability.name || capability.id || 'Unnamed function';
}

function capabilityFunctionName(capability: DiagnosticCapability): string {
    return capability.name || capability.id || '';
}

function capabilityVehicleId(capability: DiagnosticCapability, fallbackVehicleDefinitionId: string): string {
    return capability.carSelect?.trim() || fallbackVehicleDefinitionId;
}

function capabilityProtocolLabel(capability: DiagnosticCapability): string {
    const protocol = capability.protocol?.trim();
    if (!protocol) {
        return '';
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(protocol)
        ? 'protocol'
        : protocol;
}

function rawVin(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase().slice(0, 17);
}

function formatVin(value: string): string {
    const cleaned = rawVin(value);
    return [cleaned.slice(0, 3), cleaned.slice(3, 11), cleaned.slice(11)]
        .filter(Boolean)
        .join(' ');
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default function VehicleSelection() {
    const [source, setSource] = useState<SelectionSource>('manual');
    const [activeStep, setActiveStep] = useState<VehicleListType>('brands');
    const [selectedPath, setSelectedPath] = useState<SelectedPathItem[]>([]);
    const [items, setItems] = useState<VehicleSelectionItem[]>([]);
    const [activeVehicleId, setActiveVehicleId] = useState('');
    const [protocol, setProtocol] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('Select a brand to start a vehicle definition.');
    const [debugResponse, setDebugResponse] = useState<unknown>(null);

    const [guide, setGuide] = useState<unknown>(null);
    const [obdFunctions, setObdFunctions] = useState<DiagnosticFunctionItem[]>([]);
    const [rtdFunctions, setRtdFunctions] = useState<DiagnosticFunctionItem[]>([]);
    const [workspaceWarnings, setWorkspaceWarnings] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<DiagnosticCapability[]>([]);

    const [vinAvailable, setVinAvailable] = useState(false);
    const [vinHistory, setVinHistory] = useState<VinHistoryItem[]>([]);
    const [vin, setVin] = useState('');
    const [vinBusy, setVinBusy] = useState(false);
    const autoSubmittedVinRef = useRef('');

    const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEventMessage[]>([]);
    const [eventStreamStatus, setEventStreamStatus] = useState('connecting');
    const eventSocketRef = useRef<WebSocket | null>(null);
    const workspaceRequestRef = useRef(0);

    const currentMeta = stepMeta(activeStep);
    const extendedContextReady = selectedPath.length >= 3 && Boolean(activeVehicleId);

    const filteredVinHistory = useMemo(() => {
        const prefix = rawVin(vin);
        if (!prefix) {
            return vinHistory.slice(0, 8);
        }
        return vinHistory
            .filter((item) => rawVin(item.name).startsWith(prefix))
            .slice(0, 8);
    }, [vin, vinHistory]);

    function clearWorkspace() {
        workspaceRequestRef.current += 1;
        setGuide(null);
        setObdFunctions([]);
        setRtdFunctions([]);
        setCapabilities([]);
        setWorkspaceWarnings([]);
    }

    async function activateContext(vehicleDefinitionId: string): Promise<void> {
        if (!vehicleDefinitionId.trim()) {
            return;
        }

        const response = await activateVehicleContext(vehicleDefinitionId, protocol);
        setDebugResponse(response);
        setActiveVehicleId(response.active_vehicle_definition_id);
    }

    async function loadWorkspace(vehicleDefinitionId: string): Promise<void> {
        const requestId = ++workspaceRequestRef.current;
        setWorkspaceWarnings([]);
        const results = await Promise.allSettled([
            getVehicleGuide(vehicleDefinitionId),
            getVehicleObdFunctions(vehicleDefinitionId, protocol),
            getVehicleRtdFunctions(vehicleDefinitionId, protocol),
        ]);

        if (workspaceRequestRef.current !== requestId) {
            return;
        }

        const warnings: string[] = [];
        if (results[0].status === 'fulfilled') {
            setGuide(results[0].value);
        } else {
            setGuide(null);
            warnings.push(`Guide unavailable: ${errorMessage(results[0].reason)}`);
        }

        if (results[1].status === 'fulfilled' && isFunctionList(results[1].value)) {
            setObdFunctions(results[1].value);
        } else {
            setObdFunctions([]);
            warnings.push(
                results[1].status === 'rejected'
                    ? `OBD functions unavailable: ${errorMessage(results[1].reason)}`
                    : 'OBD functions did not return a list.',
            );
        }

        if (results[2].status === 'fulfilled' && isFunctionList(results[2].value)) {
            setRtdFunctions(results[2].value);
        } else {
            setRtdFunctions([]);
            warnings.push(
                results[2].status === 'rejected'
                    ? `RTD functions unavailable: ${errorMessage(results[2].reason)}`
                    : 'RTD functions did not return a list.',
            );
        }
        setWorkspaceWarnings(warnings);
    }

    async function loadStep(
        type: VehicleListType,
        parentId: string,
        pathBeforeStep: SelectedPathItem[],
        autoAdvance = true,
        selectionSource: SelectionSource = source,
    ): Promise<void> {
        setBusy(`load-${type}`);
        setError('');
        try {
            const response: VehicleSelectionResponse = await getVehicleSelection(type, parentId);
            const nextItems = Array.isArray(response.items) ? response.items : [];
            setActiveStep(type);
            setItems(nextItems);
            setDebugResponse(response);

            if (autoAdvance && type !== 'brands' && nextItems.length === 1) {
                await chooseItem(nextItems[0], type, pathBeforeStep, selectionSource);
            } else if (nextItems.length === 0) {
                setStatus('No narrower choices returned for this context. Available diagnostic data is shown on the right.');
            } else {
                setStatus(`Select ${stepMeta(type).listLabel.toLowerCase()} from ${nextItems.length} option${nextItems.length === 1 ? '' : 's'}.`);
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function chooseItem(
        item: VehicleSelectionItem,
        type: VehicleListType = activeStep,
        pathBeforeStep = selectedPath.slice(0, stepIndex(activeStep)),
        selectionSource: SelectionSource = source,
    ): Promise<void> {
        const index = stepIndex(type);
        const nextPath: SelectedPathItem[] = [
            ...pathBeforeStep.slice(0, index),
            {listType: type, id: item.id, label: itemLabel(item)},
        ];

        setSource(selectionSource);
        setSelectedPath(nextPath);
        setActiveVehicleId(item.id);
        setBusy(`select-${type}`);
        setError('');

        try {
            await activateContext(item.id);

            if (index >= 2) {
                await loadWorkspace(item.id);
            } else {
                clearWorkspace();
            }

            const followingStep = nextStep(type);
            if (followingStep) {
                await loadStep(followingStep, item.id, nextPath, true, selectionSource);
            } else {
                setItems([]);
                setStatus('Vehicle selection has reached the final known equipment context.');
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }


    async function reopenBreadcrumb(index: number): Promise<void> {
        const selectedNode = selectedPath[index];
        if (!selectedNode) {
            return;
        }

        const previousPath = selectedPath.slice(0, index);
        const previousId = previousPath[previousPath.length - 1]?.id || '';
        setSource('manual');
        setSelectedPath(previousPath);
        setActiveVehicleId(previousId);
        setCapabilities([]);

        try {
            if (previousPath.length >= 3 && previousId) {
                await activateContext(previousId);
                await loadWorkspace(previousId);
            } else {
                clearWorkspace();
            }
            await loadStep(selectedNode.listType, previousId, previousPath, true, 'manual');
        } catch (exc) {
            setError(errorMessage(exc));
        }
    }

    async function resetManualSelection(): Promise<void> {
        setSource('manual');
        setSelectedPath([]);
        setActiveVehicleId('');
        setProtocol('');
        setItems([]);
        clearWorkspace();
        setStatus('Select a brand to start a vehicle definition.');
        await loadStep('brands', '', [], false, 'manual');
    }

    async function loadCapabilities(): Promise<void> {
        if (!activeVehicleId) {
            setError('Select a vehicle context before loading capabilities.');
            return;
        }
        setBusy('capabilities');
        setError('');
        try {
            const result = await getVehicleCapabilities(activeVehicleId, protocol);
            setCapabilities(isCapabilityList(result) ? result : []);
            setDebugResponse(result);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function openRtd(item: DiagnosticFunctionItem): Promise<void> {
        const index = functionIndex(item);
        if (!activeVehicleId || index === null) {
            setError('This RTD row has no valid active vehicle context or function index.');
            return;
        }

        setBusy(`rtd-${index}`);
        setError('');
        try {
            const response = await openVehicleRtdFunction(activeVehicleId, index, protocol);
            setDebugResponse(response);
            setStatus(`Opened Real Time Data function: ${functionLabel(item)}.`);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function openObd(item: DiagnosticFunctionItem): Promise<void> {
        const helpId = item.help?.[0]?.id;
        if (!helpId) {
            setError('This OBD row does not provide a help-document ID.');
            return;
        }

        setBusy('obd-help');
        setError('');
        try {
            const response = await viewHelpDocument(String(helpId));
            setDebugResponse(response);
            setStatus(`Opened OBD function document: ${functionLabel(item)}.`);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function runCapability(capability: DiagnosticCapability): Promise<void> {
        const functionName = capabilityFunctionName(capability);
        const diagnosticVehicleId = capabilityVehicleId(capability, activeVehicleId);
        if (!functionName || !diagnosticVehicleId) {
            setError('Selected capability does not contain the required function and vehicle context.');
            return;
        }

        setBusy(`run-${functionName}`);
        setError('');
        try {
            const result = functionName === 'scan_report' || functionName === 'report'
                ? await openScanReport(diagnosticVehicleId)
                : await runDiagnosis({
                    function_name: functionName,
                    vehicle_ids: [diagnosticVehicleId],
                    protocol: protocol.trim() || capability.protocol || null,
                    data: capability.data ?? null,
                });
            setDebugResponse(result);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function resolveVin(value = vin): Promise<void> {
        const formatted = formatVin(value);
        const cleaned = rawVin(formatted);
        if (cleaned.length !== 3 && cleaned.length !== 17) {
            setError('Enter the 3-character WMI prefix or a complete 17-character VIN.');
            return;
        }

        setSource('vin');
        setVinBusy(true);
        setError('');
        try {
            const result = await selectVehicleByVin(formatted);
            setDebugResponse(result);
            setStatus('VIN lookup sent to Autocom. Waiting for the resolved vehicle path.');
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setVinBusy(false);
        }
    }

    function updateVin(value: string) {
        const formatted = formatVin(value);
        const cleaned = rawVin(formatted);
        setVin(formatted);

        if ((cleaned.length === 3 || cleaned.length === 17) && autoSubmittedVinRef.current !== cleaned) {
            autoSubmittedVinRef.current = cleaned;
            void resolveVin(formatted);
        }
    }

    async function clearVin(): Promise<void> {
        autoSubmittedVinRef.current = '';
        setVin('');
        setError('');
        try {
            setDebugResponse(await selectVehicleByVin(''));
        } catch (exc) {
            setError(errorMessage(exc));
        }
    }

    async function readVin(): Promise<void> {
        setVinBusy(true);
        setError('');
        try {
            setDebugResponse(await readVinFromVehicle());
            setStatus('VIN read requested. Complete the native VIN dialog in Autocom.');
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setVinBusy(false);
        }
    }

    function applyResolvedVinPath(data: Record<string, unknown>) {
        if (data.trigger !== 'setVin' || !Array.isArray(data.parts)) {
            return;
        }

        const path = data.parts
            .slice(0, vehicleSteps.length)
            .map((part, index) => {
                const row = part as {id?: unknown; name?: unknown};
                const id = String(row.id ?? '').trim();
                if (!id) {
                    return null;
                }
                return {
                    listType: vehicleSteps[index].type,
                    id,
                    label: String(row.name ?? id),
                };
            })
            .filter((item): item is SelectedPathItem => item !== null);

        if (!path.length) {
            return;
        }

        const activeId = path[path.length - 1].id;
        const next = vehicleSteps[path.length]?.type ?? null;
        setSource('vin');
        setSelectedPath(path);
        setActiveVehicleId(activeId);
        setVin(formatVin(String(data.echo ?? vin)));
        setStatus('VIN resolved to a vehicle context.');
        setError('');

        void activateContext(activeId)
            .then(async () => {
                if (path.length >= 3) {
                    await loadWorkspace(activeId);
                } else {
                    clearWorkspace();
                }

                if (next) {
                    await loadStep(next, activeId, path, true, 'vin');
                } else {
                    setItems([]);
                }
            })
            .catch((exc: unknown) => setError(errorMessage(exc)));
    }

    function handleDiagnosticEvent(message: DiagnosticEventMessage) {
        setDiagnosticEvents((current) => [message, ...current].slice(0, 100));

        if (!message.data || typeof message.data !== 'object') {
            return;
        }

        const data = message.data as Record<string, unknown>;
        if (message.event === 'carSelectionSet') {
            applyResolvedVinPath(data);
        } else if (message.event === 'carSelectionError' && data.trigger === 'setVin') {
            setError('Autocom could not resolve the entered VIN into a vehicle selection.');
        } else if (message.event === 'vinReadError') {
            setError('Autocom could not read a VIN from the connected vehicle.');
        } else if (message.event === 'setVinFromArgument' && typeof data.currentvin === 'string') {
            updateVin(data.currentvin);
        }
    }

    useEffect(() => {
        eventSocketRef.current = createDiagnosticsEventSocket(handleDiagnosticEvent, setEventStreamStatus);

        void loadStep('brands', '', [], false, 'manual');
        void Promise.all([getVinAvailable(), getVinHistory()])
            .then(([available, history]) => {
                setVinAvailable(Boolean(available));
                setVinHistory(Array.isArray(history) ? history : []);
            })
            .catch((exc: unknown) => setError(errorMessage(exc)));

        return () => {
            eventSocketRef.current?.close();
            eventSocketRef.current = null;
        };
    }, []);

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Vehicle Selection</h2>
                <p style={{...muted, margin: '6px 0 0'}}>
                    Reproduce the native Autocom path: select a vehicle manually or resolve it by VIN, then access connection guide and functions from the active context.
                </p>
            </header>

            {error && (
                <div style={{...card, marginBottom: 16, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239'}}>
                    {error}
                </div>
            )}

            <section style={{...card, marginBottom: 16}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                        <button
                            type="button"
                            style={{...secondaryButton, padding: '9px 12px'}}
                            onClick={() => void reopenBreadcrumb(Math.max(selectedPath.length - 1, 0))}
                            disabled={selectedPath.length === 0}
                        >
                            ← Back
                        </button>
                        {selectedPath.map((node, index) => (
                            <React.Fragment key={`${node.listType}-${node.id}`}>
                                <button
                                    type="button"
                                    onClick={() => void reopenBreadcrumb(index)}
                                    style={{...secondaryButton, padding: '9px 12px', background: '#f1f5f9'}}
                                    title={`Change ${stepMeta(node.listType).breadcrumb}`}
                                >
                                    {node.label}
                                </button>
                                <span style={{color: '#94a3b8'}}>›</span>
                            </React.Fragment>
                        ))}
                        <span style={{fontWeight: 700, color: '#2563eb'}}>{currentMeta.breadcrumb}</span>
                    </div>
                    <span style={{...muted}}>
                        Source: <strong>{source === 'vin' ? 'VIN' : 'Manual selection'}</strong>
                    </span>
                </div>
                <p style={{...muted, margin: '12px 0 0'}}>
                    Active vehicle definition ID: <code>{activeVehicleId || 'None selected'}</code>
                </p>
            </section>

            <div style={{display: 'flex', gap: 10, marginBottom: 16}}>
                <button type="button" style={source === 'manual' ? button : secondaryButton} onClick={() => void resetManualSelection()}>
                    Manual Selection
                </button>
                <button type="button" style={source === 'vin' ? button : secondaryButton} onClick={() => setSource('vin')} disabled={!vinAvailable}>
                    VIN {vinAvailable ? '' : '(unavailable)'}
                </button>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(500px, 1.35fr)', gap: 18, alignItems: 'start'}}>
                <section style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                    {source === 'vin' && (
                        <div style={card}>
                            <h3 style={{margin: '0 0 8px'}}>Vehicle Identification Number (VIN)</h3>
                            <p style={{...muted, margin: '0 0 12px'}}>
                                Enter a 3-character WMI prefix or a complete 17-character VIN, or request a VIN read from the native engine.
                            </p>
                            <input
                                value={vin}
                                onChange={(event) => updateVin(event.target.value)}
                                placeholder="ABC 12345678 123456"
                                style={{...input, marginBottom: 10}}
                            />
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12}}>
                                <button type="button" style={button} onClick={() => void resolveVin()} disabled={vinBusy}>
                                    Resolve VIN
                                </button>
                                <button type="button" style={secondaryButton} onClick={() => void readVin()} disabled={vinBusy}>
                                    Read VIN from Vehicle
                                </button>
                                <button type="button" style={dangerButton} onClick={() => void clearVin()}>
                                    Clear
                                </button>
                            </div>
                            {filteredVinHistory.length > 0 && (
                                <>
                                    <h4 style={{margin: '12px 0 8px'}}>VIN History</h4>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                                        {filteredVinHistory.map((history) => (
                                            <button
                                                type="button"
                                                key={history.name}
                                                onClick={() => {
                                                    const formatted = formatVin(history.name);
                                                    setVin(formatted);
                                                    void resolveVin(formatted);
                                                }}
                                                style={{...secondaryButton, textAlign: 'left', padding: '8px 10px'}}
                                            >
                                                {formatVin(history.name)}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div style={card}>
                        <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12}}>
                            <div>
                                <h3 style={{margin: 0}}>{currentMeta.listLabel}</h3>
                                <p style={{...muted, margin: '5px 0 0'}}>{status}</p>
                            </div>
                            <button type="button" style={dangerButton} onClick={() => void resetManualSelection()}>
                                Reset
                            </button>
                        </div>

                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8, maxHeight: 510, overflow: 'auto'}}>
                            {items.length === 0 && (
                                <p style={{...muted, margin: 0}}>
                                    {busy ? 'Loading selections...' : 'No choices returned for this step.'}
                                </p>
                            )}
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    style={{...secondaryButton, textAlign: 'left', padding: 11}}
                                    onClick={() => void chooseItem(item)}
                                >
                                    <strong style={{display: 'block'}}>{itemLabel(item)}</strong>
                                    <span style={{fontSize: 11, color: '#64748b'}}>{item.id}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={card}>
                        <h3 style={{margin: '0 0 10px'}}>Live Engine Events</h3>
                        <p style={{...muted, margin: '0 0 10px'}}>
                            SignalR stream: <strong>{eventStreamStatus}</strong>
                        </p>
                        <JsonOutput value={diagnosticEvents.slice(0, 12)} minHeight={100}/>
                    </div>
                </section>

                <section style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                    <div style={card}>
                        <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14}}>
                            <div>
                                <h3 style={{margin: 0}}>Active Diagnostic Context</h3>
                                <p style={{...muted, margin: '5px 0 0'}}>
                                    {extendedContextReady
                                        ? 'Connection guide and function lists are loaded from the active vehicle ID.'
                                        : 'Select at least Brand → Model → Year model to load connection guide and Real Time Data.'}
                                </p>
                            </div>
                            <input
                                value={protocol}
                                onChange={(event) => setProtocol(event.target.value)}
                                placeholder="Optional protocol"
                                style={{...input, width: 190}}
                            />
                        </div>
                        {workspaceWarnings.length > 0 && (
                            <div style={{background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 10, color: '#9a3412', fontSize: 12, marginBottom: 12}}>
                                {workspaceWarnings.map((warning) => <div key={warning}>{warning}</div>)}
                            </div>
                        )}
                        <h4 style={{margin: '0 0 8px'}}>Connection Guide</h4>
                        {guide ? <JsonOutput value={guide} minHeight={95}/> : <p style={muted}>No guide loaded for the current context.</p>}
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
                        <div style={card}>
                            <h3 style={{margin: '0 0 10px'}}>OBD Functions</h3>
                            {obdFunctions.length === 0 ? (
                                <p style={muted}>No OBD functions loaded.</p>
                            ) : obdFunctions.map((item, index) => (
                                <div key={`${String(item.id ?? item.name ?? index)}`} style={{display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef2f7'}}>
                                    <span style={{fontSize: 13}}>{functionLabel(item)}</span>
                                    <button type="button" style={{...secondaryButton, padding: '6px 9px'}} onClick={() => void openObd(item)} disabled={!item.help?.[0]?.id}>
                                        Open
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={card}>
                            <h3 style={{margin: '0 0 10px'}}>Real Time Data</h3>
                            {rtdFunctions.length === 0 ? (
                                <p style={muted}>No RTD functions loaded.</p>
                            ) : rtdFunctions.map((item, index) => (
                                <div key={`${String(item.index ?? item.name ?? index)}`} style={{display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef2f7'}}>
                                    <span style={{fontSize: 13}}>{functionLabel(item)}</span>
                                    <button type="button" style={{...button, padding: '6px 9px'}} onClick={() => void openRtd(item)} disabled={functionIndex(item) === null}>
                                        Open
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={card}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12}}>
                            <div>
                                <h3 style={{margin: 0}}>Diagnostic Actions</h3>
                                <p style={{...muted, margin: '5px 0 0'}}>Load capabilities for the current active vehicle context.</p>
                            </div>
                            <button type="button" style={button} onClick={() => void loadCapabilities()} disabled={!activeVehicleId}>
                                Load Capabilities
                            </button>
                        </div>

                        {capabilities.length === 0 ? (
                            <p style={muted}>No diagnostic actions loaded.</p>
                        ) : (
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                {capabilities.map((capability, index) => (
                                    <button
                                        key={`${capability.id || capability.name || index}`}
                                        type="button"
                                        disabled={Boolean(capability.disabled)}
                                        style={{...button, opacity: capability.disabled ? 0.5 : 1}}
                                        onClick={() => void runCapability(capability)}
                                    >
                                        {capabilityLabel(capability)}
                                        {capabilityProtocolLabel(capability) ? ` (${capabilityProtocolLabel(capability)})` : ''}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <details style={card}>
                        <summary style={{fontWeight: 700, cursor: 'pointer'}}>Last API / Engine Response</summary>
                        <div style={{marginTop: 12}}>
                            <JsonOutput value={debugResponse} minHeight={100}/>
                        </div>
                    </details>
                </section>
            </div>
        </div>
    );
}
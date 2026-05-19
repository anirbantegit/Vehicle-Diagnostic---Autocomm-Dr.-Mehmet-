import React, {useMemo, useState} from 'react';
import {
    getVehicleCapabilities,
    getVehicleGuide,
    getVehicleObdFunctions,
    getVehicleRtdFunctions,
    getVehicleSelection,
    postVehicleSelection,
    VehicleListType,
    VehicleSelectionItem,
    VehicleSelectionResponse,
} from '../api/bridgeClient';

const vehicleSteps: Array<{
    type: VehicleListType;
    label: string;
    needsParent: boolean;
}> = [
    {type: 'brands', label: 'Brands / Cars', needsParent: false},
    {type: 'models', label: 'Models', needsParent: true},
    {type: 'years', label: 'Years', needsParent: true},
    {type: 'systemTypes', label: 'System Types', needsParent: true},
    {type: 'engines', label: 'Engines', needsParent: true},
    {type: 'systems', label: 'Systems', needsParent: true},
    {type: 'gearboxes', label: 'Gearboxes', needsParent: true},
    {type: 'equipments', label: 'Equipments / Final Variant', needsParent: true},
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

function JsonOutput({value}: { value: unknown }) {
    return (
        <pre
            style={{
                margin: 0,
                padding: 16,
                borderRadius: 16,
                background: '#0f172a',
                color: '#dbeafe',
                overflow: 'auto',
                minHeight: 260,
                maxHeight: 560,
                fontSize: 12,
            }}
        >
    {JSON.stringify(value, null, 2)}
    </pre>
    );
}

function itemLabel(item: VehicleSelectionItem): string {
    return item.title || item.name || item.id;
}

function nextStep(current: VehicleListType): VehicleListType | null {
    const index = vehicleSteps.findIndex((step) => step.type === current);
    return vehicleSteps[index + 1]?.type || null;
}

export default function VehicleSelection() {
    const [listType, setListType] = useState<VehicleListType>('brands');
    const [parentId, setParentId] = useState('');
    const [vehicleDefinitionId, setVehicleDefinitionId] = useState('');
    const [protocol, setProtocol] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [response, setResponse] = useState<VehicleSelectionResponse | unknown>({
        message: 'Start with Brands / Cars, then click an item to continue the vehicle selection flow.',
    });
    const [selectedPath, setSelectedPath] = useState<Array<{
        listType: VehicleListType;
        id: string;
        label: string;
    }>>([]);

    const items = useMemo(() => {
        if (
            response &&
            typeof response === 'object' &&
            Array.isArray((response as VehicleSelectionResponse).items)
        ) {
            return (response as VehicleSelectionResponse).items || [];
        }

        return [];
    }, [response]);

    async function runAction(label: string, action: () => Promise<unknown>) {
        setBusy(label);
        setError('');

        try {
            const result = await action();
            setResponse(result);
        } catch (exc) {
            const message = exc instanceof Error ? exc.message : String(exc);
            setError(message);
            setResponse({error: message});
        } finally {
            setBusy('');
        }
    }

    async function loadCurrentStep() {
        await runAction(`load-${listType}`, () => getVehicleSelection(listType, parentId));
    }

    async function postCurrentStep() {
        await runAction(`post-${listType}`, () =>
            postVehicleSelection({
                list_type: listType,
                vehicle_id: parentId,
            }),
        );
    }

    async function chooseItem(item: VehicleSelectionItem) {
        const selectedId = item.id;
        const selectedLabel = itemLabel(item);
        const followingStep = nextStep(listType);

        setSelectedPath((current) => [
            ...current,
            {
                listType,
                id: selectedId,
                label: selectedLabel,
            },
        ]);

        setVehicleDefinitionId(selectedId);

        if (!followingStep) {
            setParentId(selectedId);
            setResponse({
                selected_final_vehicle_definition_id: selectedId,
                selected_label: selectedLabel,
                message: 'Reached final known vehicle-selection step. Use this ID for guide, capabilities, OBD, RTD and diagnostics.',
            });
            return;
        }

        setListType(followingStep);
        setParentId(selectedId);

        await runAction(`load-${followingStep}`, () =>
            getVehicleSelection(followingStep, selectedId),
        );
    }

    function resetFlow() {
        setListType('brands');
        setParentId('');
        setVehicleDefinitionId('');
        setProtocol('');
        setSelectedPath([]);
        setResponse({
            message: 'Selection reset. Load Brands / Cars again.',
        });
        setError('');
    }

    return (
        <div>
            <header style={{marginBottom: 22}}>
                <h2 style={{margin: 0, fontSize: 28}}>Vehicle Selection</h2>
                <p style={{color: '#64748b', margin: '6px 0 0', fontSize: 13}}>
                    Test Autocom brand → model → year → variant flow through Bridge REST APIs.
                </p>
            </header>

            {error && (
                <div
                    style={{
                        ...card,
                        marginBottom: 16,
                        background: '#fff1f2',
                        borderColor: '#fecdd3',
                        color: '#9f1239',
                    }}
                >
                    {error}
                </div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '460px 1fr',
                    gap: 18,
                    alignItems: 'start',
                }}
            >
                <section style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                    <div style={card}>
                        <h3 style={{marginTop: 0}}>Selection API Tester</h3>

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            List type
                        </label>
                        <select
                            value={listType}
                            onChange={(event) => setListType(event.target.value as VehicleListType)}
                            style={{...input, margin: '6px 0 10px'}}
                        >
                            {vehicleSteps.map((step) => (
                                <option key={step.type} value={step.type}>
                                    {step.label} — {step.type}
                                </option>
                            ))}
                        </select>

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Parent vehicle ID
                        </label>
                        <input
                            value={parentId}
                            onChange={(event) => setParentId(event.target.value)}
                            placeholder="Empty only for brands. Example: 001"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
                            <button type="button" style={button} onClick={loadCurrentStep}>
                                GET Current Step
                            </button>
                            <button type="button" style={secondaryButton} onClick={postCurrentStep}>
                                POST /vehicles/select
                            </button>
                            <button type="button" style={dangerButton} onClick={resetFlow}>
                                Reset
                            </button>
                        </div>

                        <p style={{color: '#64748b', fontSize: 12, marginBottom: 0}}>
                            Sample GET path:{' '}
                            <code>
                                {parentId
                                    ? `/bridge/vehicles/${listType}/${parentId}`
                                    : `/bridge/vehicles/${listType}`}
                            </code>
                        </p>
                    </div>

                    <div style={card}>
                        <h3 style={{marginTop: 0}}>Selected Path</h3>

                        {selectedPath.length === 0 ? (
                            <p style={{color: '#64748b', margin: 0}}>No vehicle selected yet.</p>
                        ) : (
                            <ol style={{margin: 0, paddingLeft: 20, lineHeight: 1.7}}>
                                {selectedPath.map((item, index) => (
                                    <li key={`${item.listType}-${item.id}-${index}`}>
                                        <strong>{item.listType}</strong>: {item.label}
                                        <br/>
                                        <code>{item.id}</code>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    <div style={card}>
                        <h3 style={{marginTop: 0}}>Final Vehicle Tests</h3>

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Vehicle definition ID
                        </label>
                        <input
                            value={vehicleDefinitionId}
                            onChange={(event) => setVehicleDefinitionId(event.target.value)}
                            placeholder="Example: 001021801020304"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <label style={{display: 'block', fontSize: 13, fontWeight: 700}}>
                            Protocol
                        </label>
                        <input
                            value={protocol}
                            onChange={(event) => setProtocol(event.target.value)}
                            placeholder="Optional. Example: CAN"
                            style={{...input, margin: '6px 0 10px'}}
                        />

                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() =>
                                    runAction('guide', () => getVehicleGuide(vehicleDefinitionId))
                                }
                            >
                                Guide
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() =>
                                    runAction('capabilities', () =>
                                        getVehicleCapabilities(vehicleDefinitionId, protocol),
                                    )
                                }
                            >
                                Capabilities
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() =>
                                    runAction('obd-functions', () =>
                                        getVehicleObdFunctions(vehicleDefinitionId, protocol),
                                    )
                                }
                            >
                                OBD Functions
                            </button>
                            <button
                                type="button"
                                style={secondaryButton}
                                onClick={() =>
                                    runAction('rtd-functions', () =>
                                        getVehicleRtdFunctions(vehicleDefinitionId, protocol),
                                    )
                                }
                            >
                                RTD Functions
                            </button>
                        </div>
                    </div>
                </section>

                <section style={card}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h3 style={{margin: 0}}>Response</h3>
                        <span style={{color: '#64748b', fontSize: 13}}>
                            {busy ? `Running: ${busy}` : 'Ready'}
                        </span>
                    </div>

                    {items.length > 0 && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 10,
                                marginBottom: 16,
                            }}
                        >
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => chooseItem(item)}
                                    style={{
                                        ...secondaryButton,
                                        textAlign: 'left',
                                        display: 'block',
                                        padding: 12,
                                    }}
                                >
                                    <strong>{itemLabel(item)}</strong>
                                    <br/>
                                    <span style={{fontSize: 12, color: '#475569'}}>
                                        {item.id}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <JsonOutput value={response}/>
                </section>
            </div>
        </div>
    );
}
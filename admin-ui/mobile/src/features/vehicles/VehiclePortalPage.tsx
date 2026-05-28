import {useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router';
import {useAppDispatch} from '../../app/hooks';
import {clearAuthenticated} from '../session/mobileSessionSlice';
import {DiagnosticWorkspace} from './components/DiagnosticWorkspace';
import {MobilePortalHeader} from './components/MobilePortalHeader';
import {NativePopupController} from './components/NativePopupController';
import {VehicleNavigationRail} from './components/VehicleNavigationRail';
import {VehicleSelectionPanel} from './components/VehicleSelectionPanel';
import {
    useActivateVehicleContextMutation,
    useDisconnectMobileSessionMutation,
    useGetBlockingPopupQuery,
    useInvokeRtdPopupActionMutation,
    useLazyGetMobileSessionQuery,
    useLazyGetObdFunctionsQuery,
    useLazyGetRtdFunctionsQuery,
    useLazyGetVehicleCapabilitiesQuery,
    useLazyGetVehicleGuideQuery,
    useLazyGetVehicleSelectionQuery,
    useLazyGetVinAvailableQuery,
    useLazyGetVinHistoryQuery,
    useOpenVehicleRtdFunctionMutation,
    useReadVinFromVehicleMutation,
    useSelectRtdLocationMutation,
    useSelectVehicleByVinMutation,
} from '../../services/mobileApi';
import {
    createDiagnosticsEventSocket,
    forgetMobileToken,
    hasMobileToken,
    type DiagnosticEventMessage,
    type DiagnosticFunctionItem,
    type MobileSession,
    type NativePopupState,
    type RtdPopupAction,
    type VehicleListType,
    type VehicleSelectionItem,
    type VinHistoryItem,
} from '../../mobileClient';
import {
    errorMessage,
    formatVin,
    functionIndex,
    functionLabel,
    itemLabel,
    rawVin,
    type SelectionNode,
    type SelectionSource,
    selectionSteps,
    stepIndex,
} from '../../utils/mobileFormatters';

export const VehiclePortalPage = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [loadMobileSessionRequest] = useLazyGetMobileSessionQuery();
    const [getVehicleSelectionRequest] = useLazyGetVehicleSelectionQuery();
    const [activateVehicleContextRequest] = useActivateVehicleContextMutation();
    const [getVehicleGuideRequest] = useLazyGetVehicleGuideQuery();
    const [getVehicleCapabilitiesRequest] = useLazyGetVehicleCapabilitiesQuery();
    const [getObdFunctionsRequest] = useLazyGetObdFunctionsQuery();
    const [getRtdFunctionsRequest] = useLazyGetRtdFunctionsQuery();
    const [getVinAvailableRequest] = useLazyGetVinAvailableQuery();
    const [getVinHistoryRequest] = useLazyGetVinHistoryQuery();
    const [selectVehicleByVinRequest] = useSelectVehicleByVinMutation();
    const [readVinFromVehicleRequest] = useReadVinFromVehicleMutation();
    const [openVehicleRtdFunctionRequest] = useOpenVehicleRtdFunctionMutation();
    const [invokeRtdPopupActionRequest] = useInvokeRtdPopupActionMutation();
    const [selectRtdLocationRequest] = useSelectRtdLocationMutation();
    const [disconnectMobileSessionRequest] = useDisconnectMobileSessionMutation();
    const [session, setSession] = useState<MobileSession | null>(null);
    const {data: detectedBlockingPopup} = useGetBlockingPopupQuery(undefined, {pollingInterval: 1500, skip: !session});
    const [tab, setTab] = useState<SelectionSource>('manual');
    const [selectionSource, setSelectionSource] = useState<SelectionSource>('manual');
    const [activeStep, setActiveStep] = useState<VehicleListType>('brands');
    const [path, setPath] = useState<SelectionNode[]>([]);
    const [items, setItems] = useState<VehicleSelectionItem[]>([]);
    const [done, setDone] = useState(false);
    const [activeVehicleId, setActiveVehicleId] = useState('');
    const [guide, setGuide] = useState<unknown>(null);
    const [capabilities, setCapabilities] = useState<unknown>(null);
    const [functions, setFunctions] = useState<{obd: DiagnosticFunctionItem[]; rtd: DiagnosticFunctionItem[]}>({obd: [], rtd: []});
    const [workspaceWarnings, setWorkspaceWarnings] = useState<string[]>([]);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('Select a brand to start.');
    const [search, setSearch] = useState('');
    const [vinAvailable, setVinAvailable] = useState(false);
    const [vinHistory, setVinHistory] = useState<VinHistoryItem[]>([]);
    const [vin, setVin] = useState('');
    const [vinBusy, setVinBusy] = useState(false);
    const [eventStatus, setEventStatus] = useState('Connecting...');
    const [popup, setPopup] = useState<NativePopupState | null>(null);
    const [popupItem, setPopupItem] = useState<DiagnosticFunctionItem | null>(null);
    const [popupBusy, setPopupBusy] = useState('');
    const workspaceRequestRef = useRef(0);
    const autoSubmittedVinRef = useRef('');
    const pendingVinSourceRef = useRef<SelectionSource>('vin');

    const index = stepIndex(activeStep);
    const currentStep = selectionSteps[index] || selectionSteps[0];
    const filteredItems = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return keyword ? items.filter((item) => itemLabel(item).toLowerCase().includes(keyword)) : items;
    }, [items, search]);

    const filteredVinHistory = useMemo(() => {
        const keyword = rawVin(vin);
        return vinHistory
            .filter((item) => !keyword || rawVin(item.name).startsWith(keyword))
            .slice(0, 8);
    }, [vin, vinHistory]);
    const selectionTitle = useMemo(() => path.map((node) => node.label).join('  ›  '), [path]);
    const workspaceReady = path.length >= 3 && Boolean(activeVehicleId);

    useEffect(() => {
        if (!detectedBlockingPopup || popupBusy) {
            return;
        }
        if (detectedBlockingPopup.popup_open) {
            setPopup((current) => ({...(current || {}), ...detectedBlockingPopup, source_window_handle: current?.source_window_handle}));
            return;
        }
        setPopup(null);
        setPopupItem(null);
    }, [detectedBlockingPopup, popupBusy]);

    const clearWorkspace = (): void => {
        workspaceRequestRef.current += 1;
        setGuide(null);
        setCapabilities(null);
        setFunctions({obd: [], rtd: []});
        setWorkspaceWarnings([]);
        setPopup(null);
        setPopupItem(null);
    }

    const loadStep = async (type: VehicleListType, parentId = ''): Promise<void> => {
        setBusy(`step-${type}`);
        setError('');
        setSearch('');
        try {
            const response = await getVehicleSelectionRequest({type, parentId}, true).unwrap();
            setItems(response.items || []);
            setActiveStep(type);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    const loadWorkspace = async (vehicleDefinitionId: string): Promise<void> => {
        const requestId = ++workspaceRequestRef.current;
        setWorkspaceWarnings([]);
        const results = await Promise.allSettled([
            getVehicleGuideRequest(vehicleDefinitionId, true).unwrap(),
            getVehicleCapabilitiesRequest(vehicleDefinitionId, true).unwrap(),
            getObdFunctionsRequest(vehicleDefinitionId, true).unwrap(),
            getRtdFunctionsRequest(vehicleDefinitionId, true).unwrap(),
        ]);
        if (requestId !== workspaceRequestRef.current) {
            return;
        }

        setGuide(results[0].status === 'fulfilled' ? results[0].value : null);
        setCapabilities(results[1].status === 'fulfilled' ? results[1].value : null);
        setFunctions({
            obd: results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [],
            rtd: results[3].status === 'fulfilled' && Array.isArray(results[3].value) ? results[3].value : [],
        });
        const labels = ['Guide', 'Capabilities', 'OBD functions', 'Real Time Data'];
        const warnings = results.flatMap((result, position) => (
            result.status === 'rejected' ? [`${labels[position]} unavailable: ${errorMessage(result.reason)}`] : []
        ));
        setWorkspaceWarnings(warnings);
    }

    const chooseItem = async (item: VehicleSelectionItem): Promise<void> => {
        const chosenIndex = stepIndex(activeStep);
        const nextPath = [...path.slice(0, chosenIndex), {type: activeStep, id: item.id, label: itemLabel(item)}];
        const followingStep = selectionSteps[chosenIndex + 1];
        setSelectionSource('manual');
        setTab('manual');
        setPath(nextPath);
        setActiveVehicleId(item.id);
        setDone(!followingStep);
        setBusy(`select-${activeStep}`);
        setError('');
        try {
            await activateVehicleContextRequest(item.id).unwrap();
            if (nextPath.length >= 3) {
                await loadWorkspace(item.id);
            } else {
                clearWorkspace();
            }
            if (followingStep) {
                await loadStep(followingStep.type, item.id);
                setStatus(`Active context changed to ${itemLabel(item)}. Select ${followingStep.listLabel}.`);
            } else {
                setItems([]);
                setStatus('Vehicle definition completed. The diagnostic workspace remains bound to this equipment context.');
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    const reopenBreadcrumb = async (position: number): Promise<void> => {
        const node = path[position];
        if (!node) {
            return;
        }
        const precedingPath = path.slice(0, position);
        const precedingId = precedingPath[precedingPath.length - 1]?.id || '';
        setTab('manual');
        setSelectionSource('manual');
        setPath(precedingPath);
        setActiveVehicleId(precedingId);
        setDone(false);
        setError('');
        if (precedingId) {
            await activateVehicleContextRequest(precedingId).unwrap();
        }
        if (precedingPath.length >= 3 && precedingId) {
            await loadWorkspace(precedingId);
        } else {
            clearWorkspace();
        }
        await loadStep(node.type, precedingId);
        setStatus(precedingId ? 'Previous vehicle context restored. Choose a new branch.' : 'Choose a brand to start.');
    }

    const resetSelection = async (): Promise<void> => {
        setTab('manual');
        setSelectionSource('manual');
        setPath([]);
        setActiveVehicleId('');
        setDone(false);
        clearWorkspace();
        setStatus('Select a brand to start.');
        await loadStep('brands');
    }

    const resolveVin = async (value = vin, source: SelectionSource = 'vin'): Promise<void> => {
        const formatted = formatVin(value);
        const cleaned = rawVin(formatted);
        if (cleaned.length !== 3 && cleaned.length !== 17) {
            setError('Enter the 3-character WMI prefix or a complete 17-character VIN.');
            return;
        }
        pendingVinSourceRef.current = source;
        setSelectionSource(source);
        setVinBusy(true);
        setError('');
        try {
            await selectVehicleByVinRequest(formatted).unwrap();
            setStatus('VIN lookup sent. Waiting for the resolved vehicle breadcrumb from Diagnostic Engine Console.');
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setVinBusy(false);
        }
    }

    const updateVin = (value: string): void => {
        const formatted = formatVin(value);
        const cleaned = rawVin(formatted);
        setVin(formatted);
        if ((cleaned.length === 3 || cleaned.length === 17) && autoSubmittedVinRef.current !== cleaned) {
            autoSubmittedVinRef.current = cleaned;
            void resolveVin(formatted, 'vin');
        }
    }

    const readVin = async (): Promise<void> => {
        setVinBusy(true);
        setError('');
        pendingVinSourceRef.current = 'vin';
        try {
            await readVinFromVehicleRequest().unwrap();
            setStatus('VIN read requested. Complete the native VIN operation on the connected vehicle.');
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setVinBusy(false);
        }
    }

    const clearVin = async (): Promise<void> => {
        autoSubmittedVinRef.current = '';
        setVin('');
        setError('');
        try {
            await selectVehicleByVinRequest('').unwrap();
        } catch (exc) {
            setError(errorMessage(exc));
        }
    }

    const applyResolvedVinPath = (data: Record<string, unknown>): void => {
        if (data.trigger !== 'setVin' || !Array.isArray(data.parts)) {
            return;
        }
        const resolvedPath = data.parts
            .slice(0, selectionSteps.length)
            .map((part, position) => {
                const row = part as {id?: unknown; name?: unknown};
                const id = String(row.id ?? '').trim();
                return id ? {type: selectionSteps[position].type, id, label: String(row.name ?? id)} : null;
            })
            .filter((node): node is SelectionNode => node !== null);
        if (!resolvedPath.length) {
            return;
        }
        const activeId = resolvedPath[resolvedPath.length - 1].id;
        const followingStep = selectionSteps[resolvedPath.length];
        const source = pendingVinSourceRef.current;
        setSelectionSource(source);
        setTab(source);
        setPath(resolvedPath);
        setVin(formatVin(String(data.echo ?? vin)));
        setActiveVehicleId(activeId);
        setDone(!followingStep);
        setStatus('VIN resolved. Active vehicle context and diagnostic workspace were refreshed.');
        void activateVehicleContextRequest(activeId).unwrap()
            .then(async () => {
                if (resolvedPath.length >= 3) {
                    await loadWorkspace(activeId);
                } else {
                    clearWorkspace();
                }
                if (followingStep) {
                    await loadStep(followingStep.type, activeId);
                } else {
                    setItems([]);
                }
            })
            .catch((exc) => setError(errorMessage(exc)));
    }

    const handleDiagnosticEvent = (event: DiagnosticEventMessage): void => {
        if (!event.data || typeof event.data !== 'object') {
            return;
        }
        const data = event.data as Record<string, unknown>;
        if (event.event === 'carSelectionSet') {
            applyResolvedVinPath(data);
        } else if (event.event === 'carSelectionError' && data.trigger === 'setVin') {
            setError('Diagnostic Engine Console could not resolve this VIN into a vehicle selection.');
        } else if (event.event === 'vinReadError') {
            setError('Diagnostic Engine Console could not read a VIN from the connected vehicle.');
        } else if (event.event === 'setVinFromArgument' && typeof data.currentvin === 'string') {
            updateVin(data.currentvin);
        }
    }

    const openRtd = async (item: DiagnosticFunctionItem): Promise<void> => {
        const rtdIndex = functionIndex(item);
        if (!activeVehicleId || rtdIndex === null) {
            setError('This RTD row does not contain a valid backend index for the active vehicle.');
            return;
        }
        setBusy(`rtd-${String(item.id || item.index)}`);
        setError('');
        try {
            const response = await openVehicleRtdFunctionRequest({vehicleDefinitionId: activeVehicleId, rtdIndex}).unwrap();
            setPopup(response);
            setPopupItem(item);
            setStatus(response.warning || `Native RTD popup detected for ${functionLabel(item)}. Control it below.`);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    const performPopupAction = async (action: RtdPopupAction): Promise<void> => {
        if (!popup) {
            return;
        }
        setPopupBusy(action);
        setError('');
        try {
            if (!popup.popup_window_handle) {
                throw new Error('The active native popup does not expose a controllable window handle.');
            }
            const response = await invokeRtdPopupActionRequest({
                popupWindowHandle: popup.popup_window_handle,
                action,
                fallbackWindowHandle: popup.source_window_handle,
                windowCloseFallback: action === 'cancel' && popup.detection_method === 'window_state_transition',
            }).unwrap();
            if (response.popup_open) {
                setPopup((current) => ({...(current || {}), ...response, source_window_handle: current?.source_window_handle}));
                setStatus(response.warning || `Native popup action sent: ${action.replace('_', ' ')}.`);
            } else {
                setPopup(null);
                setPopupItem(null);
                setStatus('Native popup closed. Desktop controls are available again.');
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setPopupBusy('');
        }
    }

    const selectPopupLocation = async (location: string): Promise<void> => {
        if (!popup) {
            return;
        }
        setPopupBusy('location');
        setError('');
        try {
            if (!popup.popup_window_handle) {
                throw new Error('The active native popup does not expose a controllable window handle.');
            }
            const response = await selectRtdLocationRequest({popupWindowHandle: popup.popup_window_handle, locationText: location, fallbackWindowHandle: popup.source_window_handle}).unwrap();
            setPopup((current) => ({...(current || {}), ...response, source_window_handle: current?.source_window_handle}));
            setStatus(`Native RTD location selected and verified: ${location}.`);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setPopupBusy('');
        }
    }

    const disconnect = async (): Promise<void> => {
        try {
            await disconnectMobileSessionRequest().unwrap();
        } catch {
            forgetMobileToken();
        } finally {
            dispatch(clearAuthenticated());
            navigate('/connect', {replace: true});
        }
    };

    useEffect(() => {
        let cancelled = false;
        void loadMobileSessionRequest().unwrap()
            .then(async (result) => {
                if (cancelled) {
                    return;
                }
                setSession(result);
                if (!result.engine.local_api_reachable) {
                    setError(`The PC bridge is paired, but the diagnostic engine API is not available at ${result.engine.local_api_endpoint}.`);
                    return;
                }
                await loadStep('brands');
                const [available, history] = await Promise.all([getVinAvailableRequest(undefined, true).unwrap(), getVinHistoryRequest(undefined, true).unwrap()]);
                if (!cancelled) {
                    setVinAvailable(Boolean(available));
                    setVinHistory(Array.isArray(history) ? history : []);
                }
            })
            .catch((exc) => {
                if (!cancelled) {
                    if (!hasMobileToken()) {
                        dispatch(clearAuthenticated());
                        navigate('/connect', {replace: true});
                        return;
                    }
                    setError(errorMessage(exc));
                }
            });

        const socket = createDiagnosticsEventSocket(handleDiagnosticEvent, setEventStatus);
        return () => {
            cancelled = true;
            socket?.close();
        };
    }, []);


    return (
        <main className="mobile-portal min-h-screen text-slate-100">
            <MobilePortalHeader eventStatus={eventStatus} session={session} onDisconnect={() => void disconnect()}/>
            <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-[88px_minmax(420px,560px)_1fr]">
                <VehicleNavigationRail onReset={() => void resetSelection()}/>
                <VehicleSelectionPanel
                    activeStep={activeStep}
                    busy={busy}
                    currentStep={currentStep}
                    done={done}
                    error={error}
                    filteredItems={filteredItems}
                    filteredVinHistory={filteredVinHistory}
                    path={path}
                    search={search}
                    status={status}
                    tab={tab}
                    vin={vin}
                    vinAvailable={vinAvailable}
                    vinBusy={vinBusy}
                    onBreadcrumbOpen={(position) => void reopenBreadcrumb(position)}
                    onChooseItem={(item) => void chooseItem(item)}
                    onHistoryRestore={(entry) => {
                        const formatted = formatVin(entry.name);
                        setVin(formatted);
                        void resolveVin(formatted, 'history');
                    }}
                    onSearchChange={setSearch}
                    onTabChange={setTab}
                    onVinChange={updateVin}
                    onVinClear={() => void clearVin()}
                    onVinRead={() => void readVin()}
                    onVinResolve={() => void resolveVin()}
                />
                <DiagnosticWorkspace
                    activeVehicleId={activeVehicleId}
                    capabilities={capabilities}
                    functions={functions}
                    guide={guide}
                    rtdBusyKey={busy.startsWith('rtd-') ? busy.replace('rtd-', '') : ''}
                    selectionSource={selectionSource}
                    selectionTitle={selectionTitle}
                    workspaceReady={workspaceReady}
                    workspaceWarnings={workspaceWarnings}
                    onOpenRtd={(item) => void openRtd(item)}
                />
            </div>

            {popup && popup.popup_open && (
                <NativePopupController
                    busy={popupBusy}
                    item={popupItem}
                    popup={popup}
                    onAction={(action) => void performPopupAction(action)}
                    onLocation={(location) => void selectPopupLocation(location)}
                />
            )}
        </main>
    );
};

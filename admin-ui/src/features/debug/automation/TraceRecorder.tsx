import React, {useEffect, useMemo, useRef, useState} from 'react';
import {TraceControlItem, TraceScreenResponse, TraceWindow} from '../../../api/bridgeClient';
import {
    useClickTraceWindowPointMutation,
    useInvokeNativeControlMutation,
    useInvokeRtdPopupActionMutation,
    useLazyGetTraceWindowScreenQuery,
    useLazyGetTraceWindowsQuery,
    useOpenRtdPopupAndConfirmMutation,
    useSelectRtdLocationMutation,
} from '../../../services/bridgeApi';

type TraceAction = 'record-start' | 'screen-change' | 'manual-snapshot' | 'control-click' | 'native-action' | 'signalr-confirmed' | 'record-stop';

type TraceStep = {
    sequence: number;
    captured_at: string;
    action: TraceAction;
    action_data?: Record<string, unknown>;
    window: TraceWindow;
    screen: Omit<TraceScreenResponse, 'screenshot_data_url' | 'windows'>;
};

type TraceReport = {
    report_type: 'desktop_ui_automation_trace';
    report_version: 1;
    generated_at: string;
    target_window: TraceWindow | null;
    steps: TraceStep[];
};

const panel: React.CSSProperties = {
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

function screenForReport(screen: TraceScreenResponse): Omit<TraceScreenResponse, 'screenshot_data_url' | 'windows'> {
    const {screenshot_data_url: _preview, windows: _windows, ...capturedScreen} = screen;
    return capturedScreen;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error && typeof error === 'object') {
        const candidate = error as {
            message?: unknown;
            data?: unknown;
            detail?: unknown;
        };

        if (typeof candidate.message === 'string' && candidate.message.trim()) {
            return candidate.message;
        }

        if (candidate.data && typeof candidate.data === 'object') {
            const data = candidate.data as {detail?: unknown; message?: unknown};

            if (typeof data.message === 'string' && data.message.trim()) {
                return data.message;
            }

            if (typeof data.detail === 'string' && data.detail.trim()) {
                return data.detail;
            }

            if (data.detail && typeof data.detail === 'object') {
                const nested = data.detail as {detail?: unknown; message?: unknown};

                if (typeof nested.message === 'string' && nested.message.trim()) {
                    return nested.message;
                }

                if (typeof nested.detail === 'string' && nested.detail.trim()) {
                    return nested.detail;
                }
            }
        }
    }

    return 'Desktop UI trace request failed.';
}

function createStep(
    action: TraceAction,
    screen: TraceScreenResponse,
    sequence: number,
    actionData?: Record<string, unknown>,
): TraceStep {
    return {
        sequence,
        captured_at: new Date().toISOString(),
        action,
        action_data: actionData,
        window: screen.window,
        screen: screenForReport(screen),
    };
}

function downloadReport(report: TraceReport): void {
    const blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `desktop-ui-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function screenFingerprint(screen: TraceScreenResponse): string {
    return JSON.stringify({
        handle: screen.window.handle,
        title: screen.window.title,
        controls: screen.controls.map((control) => [
            control.label,
            control.control_type,
            control.rect_info?.relative_left,
            control.rect_info?.relative_top,
        ]),
    });
}

function canMapControl(control: TraceControlItem, screen: TraceScreenResponse): boolean {
    const rect = control.rect_info;
    if (!rect) {
        return false;
    }
    return (
        typeof rect.relative_left === 'number'
        && typeof rect.relative_top === 'number'
        && rect.relative_left >= 0
        && rect.relative_top >= 0
        && rect.width > 2
        && rect.height > 2
        && rect.relative_left + rect.width <= screen.window_rect.width
        && rect.relative_top + rect.height <= screen.window_rect.height
    );
}

export default function TraceRecorder() {
    const [windows, setWindows] = useState<TraceWindow[]>([]);
    const [selectedHandle, setSelectedHandle] = useState<number | null>(null);
    const [rtdSourceHandle, setRtdSourceHandle] = useState<number | null>(null);
    const [rtdPopupHandle, setRtdPopupHandle] = useState<number | null>(null);
    const [screen, setScreen] = useState<TraceScreenResponse | null>(null);
    const [steps, setSteps] = useState<TraceStep[]>([]);
    const [recording, setRecording] = useState<boolean>(false);
    const [filter, setFilter] = useState<string>('');
    const [busy, setBusy] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [rtdIndex, setRtdIndex] = useState<string>('69');
    const [locationText, setLocationText] = useState<string>('Brake - ABS - Wabco ABS E Hydraulic');
    const [automationResult, setAutomationResult] = useState<string>('');
    const pollingRef = useRef<boolean>(false);
    const fingerprintRef = useRef<string>('');
    const [fetchTraceWindows] = useLazyGetTraceWindowsQuery();
    const [fetchTraceScreen] = useLazyGetTraceWindowScreenQuery();
    const [clickTracePoint] = useClickTraceWindowPointMutation();
    const [invokeControl] = useInvokeNativeControlMutation();
    const [openRtdPopup] = useOpenRtdPopupAndConfirmMutation();
    const [invokeRtdAction] = useInvokeRtdPopupActionMutation();
    const [selectLocation] = useSelectRtdLocationMutation();

    async function refreshWindows(keepSelection = true): Promise<TraceWindow[]> {
        const response = await fetchTraceWindows().unwrap();
        setWindows(response.windows);

        const existing = keepSelection
            ? response.windows.find((window) => window.handle === selectedHandle)
            : undefined;
        const engineWindow = response.windows.find((window) => window.engine_candidate);
        const nextWindow = existing && (existing.engine_candidate || existing.handle === rtdPopupHandle)
            ? existing
            : engineWindow || existing || response.windows[0];

        if (nextWindow && nextWindow.handle !== selectedHandle) {
            setSelectedHandle(nextWindow.handle);
        }
        return response.windows;
    }

    async function fetchScreen(windowHandle: number): Promise<TraceScreenResponse> {
        const response = await fetchTraceScreen({windowHandle}).unwrap();
        setScreen(response);
        fingerprintRef.current = screenFingerprint(response);
        return response;
    }

    async function selectWindow(windowHandle: number): Promise<void> {
        setSelectedHandle(windowHandle);
        setBusy('screen');
        setError('');
        try {
            await fetchScreen(windowHandle);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function detectWindows(): Promise<void> {
        setBusy('windows');
        setError('');
        try {
            const availableWindows = await refreshWindows(false);
            const engineWindow = availableWindows.find((window) => window.engine_candidate) || availableWindows[0];
            if (engineWindow) {
                await selectWindow(engineWindow.handle);
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function startRecording(): Promise<void> {
        if (selectedHandle === null) {
            setError('Select a target desktop window before recording.');
            return;
        }
        setBusy('record-start');
        setError('');
        try {
            const snapshot = await fetchScreen(selectedHandle);
            setSteps([createStep('record-start', snapshot, 1)]);
            setRecording(true);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function captureSnapshot(): Promise<void> {
        if (selectedHandle === null) {
            return;
        }
        setBusy('snapshot');
        setError('');
        try {
            const snapshot = await fetchScreen(selectedHandle);
            if (recording) {
                setSteps((current) => [
                    ...current,
                    createStep('manual-snapshot', snapshot, current.length + 1),
                ]);
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function clickRelativePoint(
        x: number,
        y: number,
        actionData: Record<string, unknown>,
    ): Promise<void> {
        if (selectedHandle === null) {
            return;
        }
        setBusy('click');
        setError('');
        try {
            const result = await clickTracePoint({windowHandle: selectedHandle, x, y}).unwrap();
            setScreen(result);
            fingerprintRef.current = screenFingerprint(result);
            if (result.windows) {
                setWindows(result.windows);
            }
            if (recording) {
                setSteps((current) => [
                    ...current,
                    createStep('control-click', result, current.length + 1, actionData),
                ]);
            }
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    function acceptAutomatedScreen(
        snapshot: TraceScreenResponse,
        action: TraceAction,
        actionData: Record<string, unknown>,
    ): void {
        setScreen(snapshot);
        setSelectedHandle(snapshot.window.handle);
        fingerprintRef.current = screenFingerprint(snapshot);
        setWindows((current) => {
            const candidates = snapshot.windows || current;
            const exists = candidates.some(
                (candidate) => candidate.handle === snapshot.window.handle,
            );

            return exists
                ? candidates.map((candidate) =>
                    candidate.handle === snapshot.window.handle
                        ? snapshot.window
                        : candidate,
                )
                : [snapshot.window, ...candidates];
        });
        if (recording) {
            setSteps((current) => [
                ...current,
                createStep(action, snapshot, current.length + 1, actionData),
            ]);
        }
    }

    async function openConfirmedRtdPopup(): Promise<void> {
        const selectedWindow = windows.find((window) => window.handle === selectedHandle);
        if (selectedHandle === null || !selectedWindow?.engine_candidate) {
            setError('Select the detected Diagnostic Engine window before opening an RTD popup.');
            return;
        }
        const sourceWindowHandle = selectedHandle;
        const index = Number(rtdIndex);
        if (!Number.isInteger(index)) {
            setError('RTD index must be a valid integer.');
            return;
        }
        setBusy('rtd-open');
        setError('');
        try {
            const response = await openRtdPopup({windowHandle: sourceWindowHandle, rtdIndex: index}).unwrap();
            setRtdSourceHandle(sourceWindowHandle);
            setRtdPopupHandle(response.popup_window_handle);
            setAutomationResult(`Confirmed popup HWND ${response.popup_window_handle}: ${response.popup.automation_id}; Run: ${response.run_button.automation_id}`);
            acceptAutomatedScreen(response.screen, 'signalr-confirmed', {
                command: 'viewRTDHelpDocument',
                rtd_index: index,
                confirmation: response.confirmation,
            });
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function executeRtdPopupAction(action: 'run' | 'select_vehicle' | 'help' | 'cancel'): Promise<void> {
        if (rtdPopupHandle === null) {
            setError('Open and confirm the RTD popup before executing a popup action.');
            return;
        }
        setBusy(`rtd-${action}`);
        setError('');
        try {
            const snapshot = await invokeRtdAction({
                windowHandle: rtdPopupHandle,
                fallbackWindowHandle: rtdSourceHandle ?? undefined,
                action,
            }).unwrap();
            if (snapshot.target_window_closed || action === 'cancel') {
                setRtdPopupHandle(null);
            }
            setAutomationResult(`RTD popup action completed in background: ${action}`);
            acceptAutomatedScreen(snapshot, 'native-action', {source: 'native-uia', action});
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function selectPopupLocation(): Promise<void> {
        if (rtdPopupHandle === null || !locationText.trim()) {
            setError('Open and confirm the RTD popup, then provide a location row text.');
            return;
        }
        setBusy('rtd-select-location');
        setError('');
        try {
            const snapshot = await selectLocation({
                windowHandle: rtdPopupHandle,
                fallbackWindowHandle: rtdSourceHandle ?? undefined,
                locationText: locationText.trim(),
            }).unwrap();
            setAutomationResult(`Selected RTD location in background: ${locationText.trim()}`);
            acceptAutomatedScreen(snapshot, 'native-action', {source: 'native-uia', action: 'select-location', text: locationText.trim()});
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    async function invokeCapturedControl(control: TraceControlItem): Promise<void> {
        if (selectedHandle === null) {
            return;
        }
        const selector = control.automation_id
            ? {automation_id: control.automation_id, control_type: control.control_type}
            : {text: control.text, control_type: control.control_type};
        if (!control.automation_id && !control.text) {
            setError('This unnamed control cannot be safely re-identified. Use physical preview click only when needed.');
            return;
        }
        const action = control.control_type === 'ListItem' ? 'select' : 'invoke';
        setBusy('native-control');
        setError('');
        try {
            const snapshot = await invokeControl({windowHandle: selectedHandle, selector, action}).unwrap();
            acceptAutomatedScreen(snapshot, 'native-action', {source: 'captured-control', selector, action});
            setAutomationResult(`Native control action completed without coordinate click: ${control.label}`);
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    
    async function clickControl(control: TraceControlItem): Promise<void> {
        const x = control.rect_info?.relative_center_x;
        const y = control.rect_info?.relative_center_y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            setError('This UI control does not expose a valid clickable centre point.');
            return;
        }
        await clickRelativePoint(Math.round(x as number), Math.round(y as number), {
            source: 'captured-control',
            label: control.label,
            text: control.text,
            control_type: control.control_type,
            automation_id: control.automation_id,
            class_name: control.class_name,
            relative_x: Math.round(x as number),
            relative_y: Math.round(y as number),
        });
    }

    async function clickPreview(event: React.MouseEvent<HTMLDivElement>): Promise<void> {
        if (!screen) {
            return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width || !bounds.height) {
            return;
        }
        const x = Math.round(((event.clientX - bounds.left) / bounds.width) * screen.window_rect.width);
        const y = Math.round(((event.clientY - bounds.top) / bounds.height) * screen.window_rect.height);
        await clickRelativePoint(x, y, {source: 'preview-coordinate', relative_x: x, relative_y: y});
    }

    async function stopAndExport(): Promise<void> {
        if (selectedHandle === null) {
            return;
        }
        setBusy('record-stop');
        setError('');
        try {
            const snapshot = await fetchScreen(selectedHandle);
            const completedSteps = [
                ...steps,
                createStep('record-stop', snapshot, steps.length + 1),
            ];
            setSteps(completedSteps);
            setRecording(false);
            downloadReport({
                report_type: 'desktop_ui_automation_trace',
                report_version: 1,
                generated_at: new Date().toISOString(),
                target_window: snapshot.window,
                steps: completedSteps,
            });
        } catch (exc) {
            setError(errorMessage(exc));
        } finally {
            setBusy('');
        }
    }

    function exportCurrent(): void {
        downloadReport({
            report_type: 'desktop_ui_automation_trace',
            report_version: 1,
            generated_at: new Date().toISOString(),
            target_window: screen?.window || null,
            steps,
        });
    }

    useEffect(() => {
        void detectWindows();
    }, []);

    useEffect(() => {
        if (!recording || selectedHandle === null) {
            return;
        }
        const timer = window.setInterval(() => {
            if (pollingRef.current) {
                return;
            }
            pollingRef.current = true;
            void fetchTraceScreen({
                windowHandle: selectedHandle,
                includePreview: false,
            }).unwrap()
                .then(async (nextScreen) => {
                    const nextFingerprint = screenFingerprint(nextScreen);
                    if (nextFingerprint !== fingerprintRef.current) {
                        const capturedScreen = await fetchScreen(selectedHandle);
                        setSteps((current) => [
                            ...current,
                            createStep('screen-change', capturedScreen, current.length + 1),
                        ]);
                    }
                })
                .catch((exc: unknown) => setError(errorMessage(exc)))
                .finally(() => {
                    pollingRef.current = false;
                });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [recording, selectedHandle]);

    const displayedControls = useMemo(() => {
        if (!screen) {
            return [];
        }
        const keyword = filter.trim().toLowerCase();
        return screen.controls.filter((control) => {
            if (!keyword) {
                return true;
            }
            return [control.label, control.text, control.control_type, control.automation_id, control.class_name]
                .join(' ')
                .toLowerCase()
                .includes(keyword);
        });
    }, [filter, screen]);

    const overlayControls = useMemo(() => {
        if (!screen) {
            return [];
        }
        return [...displayedControls]
            .filter((control) => canMapControl(control, screen))
            .sort((left, right) => {
                const leftArea = (left.rect_info?.width || 0) * (left.rect_info?.height || 0);
                const rightArea = (right.rect_info?.width || 0) * (right.rect_info?.height || 0);
                return rightArea - leftArea;
            })
            .slice(0, 250);
    }, [displayedControls, screen]);

    return (
        <section style={{...panel, marginBottom: 18}}>
            <div style={{display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16}}>
                <div>
                    <h3 style={{margin: '0 0 6px'}}>Desktop UI Trace Recorder</h3>
                    <p style={{margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.5}}>
                        Select a visible desktop window, record a journey, and click mapped internal controls.
                        Each transition is captured into an automation-ready JSON report.
                    </p>
                </div>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'start'}}>
                    <button type="button" style={secondaryButton} onClick={() => void detectWindows()}>
                        Detect Windows
                    </button>
                    {!recording ? (
                        <button type="button" style={button} onClick={() => void startRecording()} disabled={selectedHandle === null}>
                            Record Trace
                        </button>
                    ) : (
                        <button type="button" style={dangerButton} onClick={() => void stopAndExport()}>
                            Stop &amp; Export Report
                        </button>
                    )}
                    <button type="button" style={secondaryButton} onClick={exportCurrent} disabled={steps.length === 0}>
                        Export Current
                    </button>
                </div>
            </div>

            {error && (
                <div style={{padding: 12, marginBottom: 14, borderRadius: 12, background: '#fff1f2', color: '#9f1239'}}>
                    {error}
                </div>
            )}

            <div style={{...panel, boxShadow: 'none', background: '#f8fafc', marginBottom: 16}}>
                <h4 style={{margin: '0 0 8px'}}>RTD Native Popup Controls — API Driven</h4>
                <p style={{margin: '0 0 8px', color: '#64748b', fontSize: 13}}>
                    Open through SignalR and confirm the native popup. Run, Select vehicle and Cancel use UI Automation invoke/select without focusing the main app.
                </p>
                <p style={{margin: '0 0 12px', color: screen?.active_modal ? '#166534' : '#64748b', fontSize: 13, fontWeight: 600}}>
                    Popup status: {screen?.active_modal ? `Detected (${screen.active_modal.automation_id})` : 'Not detected'}
                </p>
                <div style={{display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 10}}>
                    <input value={rtdIndex} onChange={(event) => setRtdIndex(event.target.value)} style={input} aria-label="RTD index"/>
                    <input value={locationText} onChange={(event) => setLocationText(event.target.value)} style={input} aria-label="RTD location row"/>
                </div>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                    <button type="button" style={button} onClick={() => void openConfirmedRtdPopup()}>Open + Confirm Popup</button>
                    <button type="button" style={secondaryButton} disabled={rtdPopupHandle === null} onClick={() => void selectPopupLocation()}>Select Location Row</button>
                    <button type="button" style={button} disabled={rtdPopupHandle === null} onClick={() => void executeRtdPopupAction('run')}>Run Function</button>
                    <button type="button" style={secondaryButton} disabled={rtdPopupHandle === null} onClick={() => void executeRtdPopupAction('select_vehicle')}>Select Vehicle</button>
                    <button type="button" style={secondaryButton} disabled={rtdPopupHandle === null} onClick={() => void executeRtdPopupAction('help')}>Help</button>
                    <button type="button" style={dangerButton} disabled={rtdPopupHandle === null} onClick={() => void executeRtdPopupAction('cancel')}>Cancel</button>
                </div>
                {automationResult && <p style={{margin: '12px 0 0', color: '#166534', fontSize: 13}}>{automationResult}</p>}
            </div>

            
            <div style={{display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start'}}>
                <div>
                    <h4 style={{margin: '0 0 10px'}}>Detected Windows</h4>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflow: 'auto'}}>
                        {windows.length === 0 && <p style={{color: '#64748b', fontSize: 13}}>No visible windows found.</p>}
                        {windows.map((targetWindow) => (
                            <button
                                key={targetWindow.handle}
                                type="button"
                                onClick={() => void selectWindow(targetWindow.handle)}
                                style={{
                                    border: selectedHandle === targetWindow.handle ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    background: targetWindow.engine_candidate ? '#eff6ff' : '#fff',
                                    padding: 10,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <strong style={{display: 'block', fontSize: 13}}>{targetWindow.title}</strong>
                                <span style={{display: 'block', marginTop: 4, color: '#64748b', fontSize: 11}}>
                                    PID {targetWindow.pid ?? '-'} · HWND {targetWindow.handle}
                                </span>
                                {targetWindow.engine_candidate && (
                                    <span style={{display: 'inline-block', marginTop: 6, padding: '3px 7px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700}}>
                                        Diagnostic Engine
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {screen?.related_windows && screen.related_windows.length > 1 && (
                        <>
                            <h4 style={{margin: '16px 0 8px'}}>Same PID Windows</h4>
                            {screen.related_windows.map((related) => (
                                <div key={related.handle} style={{fontSize: 12, color: '#475569', marginBottom: 5}}>
                                    HWND {related.handle}: {related.title || related.class_name}
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div>
                    <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap'}}>
                        <div>
                            <strong>{screen?.window.title || 'Select a window'}</strong>
                            <div style={{fontSize: 12, color: recording ? '#dc2626' : '#64748b', marginTop: 4}}>
                                {recording ? `● Recording · ${steps.length} captured steps` : `${steps.length} captured steps`}
                            </div>
                        </div>
                        <div style={{display: 'flex', gap: 8}}>
                            <input
                                value={filter}
                                onChange={(event) => setFilter(event.target.value)}
                                placeholder="Filter controls..."
                                style={{...input, width: 190}}
                            />
                            <button type="button" style={secondaryButton} onClick={() => void captureSnapshot()} disabled={selectedHandle === null}>
                                Capture Screen
                            </button>
                        </div>
                    </div>

                    <div style={{border: '1px solid #e2e8f0', borderRadius: 14, padding: 10, background: '#f8fafc', minHeight: 250}}>
                        {screen?.screenshot_data_url ? (
                            <div
                                style={{position: 'relative', width: 'fit-content', maxWidth: '100%', cursor: 'crosshair'}}
                                onClick={(event) => void clickPreview(event)}
                                title="Click anywhere in the preview to capture native/icon actions"
                            >
                                <img
                                    src={screen.screenshot_data_url}
                                    alt="Selected desktop window preview"
                                    style={{display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 8}}
                                />
                                {overlayControls.map((control) => {
                                    const rect = control.rect_info!;
                                    return (
                                        <button
                                            key={`${control.index}-${control.rect}`}
                                            type="button"
                                            title={`Click: ${control.label} (${control.control_type})`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                const canInvoke = (control.control_type === 'Button' || control.control_type === 'ListItem')
                                                    && Boolean(control.automation_id || control.text);
                                                void (canInvoke ? invokeCapturedControl(control) : clickControl(control));
                                            }}
                                            style={{
                                                position: 'absolute',
                                                left: `${(rect.relative_left! / screen.window_rect.width) * 100}%`,
                                                top: `${(rect.relative_top! / screen.window_rect.height) * 100}%`,
                                                width: `${(rect.width / screen.window_rect.width) * 100}%`,
                                                height: `${(rect.height / screen.window_rect.height) * 100}%`,
                                                border: '1px solid rgba(37,99,235,0.42)',
                                                background: 'rgba(37,99,235,0.06)',
                                                cursor: 'crosshair',
                                                padding: 0,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{color: '#64748b', fontSize: 13}}>
                                {busy ? 'Loading desktop preview...' : 'Select a detected window to load its preview.'}
                            </p>
                        )}
                    </div>

                    <div style={{marginTop: 12, maxHeight: 260, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                            <thead>
                            <tr style={{background: '#f8fafc'}}>
                                <th style={th}>Control</th>
                                <th style={th}>Type</th>
                                <th style={th}>Position</th>
                                <th style={th}>Action</th>
                            </tr>
                            </thead>
                            <tbody>
                            {displayedControls.length === 0 && (
                                <tr><td style={td} colSpan={4}>No controls captured for this window.</td></tr>
                            )}
                            {displayedControls.slice(0, 300).map((control) => (
                                <tr key={`${control.index}-${control.rect}`}>
                                    <td style={td} title={control.class_name}>{control.label}</td>
                                    <td style={td}>{control.control_type}</td>
                                    <td style={td}>
                                        {Number.isFinite(control.rect_info?.relative_center_x)
                                            ? `${Math.round(control.rect_info!.relative_center_x!)}, ${Math.round(control.rect_info!.relative_center_y!)}`
                                            : '-'}
                                    </td>
                                    <td style={td}>
                                        {(control.automation_id || control.text) && (control.control_type === 'Button' || control.control_type === 'ListItem') ? (
                                            <button type="button" style={{...button, padding: '6px 10px'}} onClick={() => void invokeCapturedControl(control)}>
                                                Invoke
                                            </button>
                                        ) : (
                                            <button type="button" style={{...secondaryButton, padding: '6px 10px'}} onClick={() => void clickControl(control)}>
                                                Physical Click
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}

const th: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    borderBottom: '1px solid #e2e8f0',
    color: '#475569',
};

const td: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: '1px solid #eef2f7',
    verticalAlign: 'top',
};
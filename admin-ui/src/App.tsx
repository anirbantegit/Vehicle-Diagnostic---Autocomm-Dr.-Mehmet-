import {useEffect, useState} from 'react';
import {Navigate, Route, Routes} from 'react-router';
import {bootstrapAdminSession} from './api/bridgeClient';
import AdminLayout from './layouts/AdminLayout';
import DebugLayout from './layouts/DebugLayout';
import Dashboard from './pages/Dashboard';
import DebugLogs from './pages/DebugLogs';
import EngineControl from './pages/EngineControl';
import Settings from './pages/Settings';
import VehicleSelection from './pages/VehicleSelection';

export default function App() {
    const [sessionReady, setSessionReady] = useState<boolean>(false);
    const [sessionError, setSessionError] = useState<string>('');

    useEffect(() => {
        void bootstrapAdminSession()
            .then(() => setSessionReady(true))
            .catch((error: Error) => setSessionError(error.message));
    }, []);

    if (sessionError) {
        return <div className="p-8 text-red-700">Local Admin Console could not be started: {sessionError}</div>;
    }

    if (!sessionReady) {
        return <div className="p-8 text-slate-600">Starting secure local console...</div>;
    }

    return (
        <Routes>
            <Route element={<AdminLayout/>}>
                <Route index element={<Navigate to="connect" replace/>}/>
                <Route path="connect" element={<Dashboard/>}/>
                <Route path="debug" element={<DebugLayout/>}>
                    <Route index element={<Navigate to="vehicle" replace/>}/>
                    <Route path="vehicle" element={<VehicleSelection/>}/>
                    <Route path="engine" element={<EngineControl/>}/>
                    <Route path="logs" element={<DebugLogs/>}/>
                    <Route path="runtime-notes" element={<Settings/>}/>
                </Route>
                <Route path="*" element={<Navigate to="connect" replace/>}/>
            </Route>
        </Routes>
    );
}
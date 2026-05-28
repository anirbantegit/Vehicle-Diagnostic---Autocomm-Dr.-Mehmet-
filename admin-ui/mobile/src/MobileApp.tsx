import {useEffect} from 'react';
import {Navigate, Outlet, Route, Routes} from 'react-router';
import {useAppSelector} from './app/hooks';
import {PairLandingPage} from './features/pairing/PairLandingPage';
import {PairingConnectPage} from './features/pairing/PairingConnectPage';
import {selectTheme, THEME_STORAGE_KEY} from './features/preferences/preferencesSlice';
import {selectIsAuthenticated} from './features/session/mobileSessionSlice';
import {VehiclePortalPage} from './features/vehicles/VehiclePortalPage';

const ProtectedMobileRoute = () => {
    const authenticated = useAppSelector(selectIsAuthenticated);
    return authenticated ? <Outlet/> : <Navigate to="/connect" replace/>;
};

const MobileApp = () => {
    const theme = useAppSelector(selectTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    return (
        <Routes>
            <Route path="/pair" element={<PairLandingPage/>}/>
            <Route path="/connect" element={<PairingConnectPage/>}/>
            <Route element={<ProtectedMobileRoute/>}>
                <Route path="/vehicles" element={<VehiclePortalPage/>}/>
            </Route>
            <Route index element={<Navigate to="/vehicles" replace/>}/>
            <Route path="*" element={<Navigate to="/vehicles" replace/>}/>
        </Routes>
    );
};

export default MobileApp;

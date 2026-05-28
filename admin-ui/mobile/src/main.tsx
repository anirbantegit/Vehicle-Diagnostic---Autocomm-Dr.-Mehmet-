import {createRoot} from 'react-dom/client';
import {Provider} from 'react-redux';
import {BrowserRouter} from 'react-router';
import {mobileStore} from './app/store';
import MobileApp from './MobileApp';
import './tailwind.css';

// Pairing is a one-time token claim, so do not use StrictMode's development
// effect replay around the mobile entry point.
createRoot(document.getElementById('root') as HTMLElement).render(
    <Provider store={mobileStore}>
        <BrowserRouter basename="/mobile">
            <MobileApp/>
        </BrowserRouter>
    </Provider>,
);

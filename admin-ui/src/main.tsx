import React from 'react';
import {createRoot} from 'react-dom/client';
import {Provider} from 'react-redux';
import {BrowserRouter} from 'react-router';
import App from './App';
import {store} from './app/store';
import './styles/index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <Provider store={store}>
            <BrowserRouter basename="/admin">
                <App/>
            </BrowserRouter>
        </Provider>
    </React.StrictMode>,
);
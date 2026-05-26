import {configureStore} from '@reduxjs/toolkit';
import {bridgeApi} from '../services/bridgeApi';

export const store = configureStore({
    reducer: {
        [bridgeApi.reducerPath]: bridgeApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(bridgeApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
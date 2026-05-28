import {configureStore} from '@reduxjs/toolkit';
import mobileSessionReducer from '../features/session/mobileSessionSlice';
import preferencesReducer from '../features/preferences/preferencesSlice';
import {mobileApi} from '../services/mobileApi';

export const mobileStore = configureStore({
    reducer: {
        mobileSession: mobileSessionReducer,
        preferences: preferencesReducer,
        [mobileApi.reducerPath]: mobileApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(mobileApi.middleware),
});

export type RootState = ReturnType<typeof mobileStore.getState>;
export type AppDispatch = typeof mobileStore.dispatch;
export type AppStore = typeof mobileStore;

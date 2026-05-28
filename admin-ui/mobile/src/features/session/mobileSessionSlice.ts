import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import {hasMobileToken} from '../../mobileClient';
import type {RootState} from '../../app/store';

type MobileSessionState = {
    authenticated: boolean;
};

const initialState: MobileSessionState = {
    authenticated: hasMobileToken(),
};

const mobileSessionSlice = createSlice({
    name: 'mobileSession',
    initialState,
    reducers: {
        setAuthenticated: (state, action: PayloadAction<boolean>) => {
            state.authenticated = action.payload;
        },
        clearAuthenticated: (state) => {
            state.authenticated = false;
        },
    },
});

export const {setAuthenticated, clearAuthenticated} = mobileSessionSlice.actions;
export const selectIsAuthenticated = (state: RootState): boolean => state.mobileSession.authenticated;
export default mobileSessionSlice.reducer;

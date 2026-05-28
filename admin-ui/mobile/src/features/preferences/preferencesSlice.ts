import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from '../../app/store';

export type ThemeMode = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'diagnostic_engine_mobile_theme';

const initialTheme = (): ThemeMode => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

type PreferencesState = {theme: ThemeMode};

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState: {theme: initialTheme()} as PreferencesState,
    reducers: {
        setTheme: (state, action: PayloadAction<ThemeMode>) => {
            state.theme = action.payload;
        },
        toggleTheme: (state) => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
        },
    },
});

export const {setTheme, toggleTheme} = preferencesSlice.actions;
export const selectTheme = (state: RootState): ThemeMode => state.preferences.theme;
export default preferencesSlice.reducer;

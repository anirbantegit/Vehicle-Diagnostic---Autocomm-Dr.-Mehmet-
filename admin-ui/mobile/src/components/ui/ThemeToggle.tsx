import {useAppDispatch, useAppSelector} from '../../app/hooks';
import {selectTheme, toggleTheme} from '../../features/preferences/preferencesSlice';

export const ThemeToggle = () => {
    const dispatch = useAppDispatch();
    const theme = useAppSelector(selectTheme);
    const target = theme === 'dark' ? 'light' : 'dark';

    return (
        <button
            aria-label={`Switch to ${target} theme`}
            className="mobile-theme-toggle rounded-xl border px-3 py-2 text-xs font-semibold"
            type="button"
            onClick={() => dispatch(toggleTheme())}
        >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
    );
};

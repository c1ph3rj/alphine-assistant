import type { ThemePreference } from '../domain/models';

let detachSystemListener: (() => void) | null = null;

function getMediaQueryList() {
    return window.matchMedia('(prefers-color-scheme: dark)');
}

function applyResolvedTheme(isDark: boolean) {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

function clearSystemListener() {
    if (detachSystemListener) {
        detachSystemListener();
        detachSystemListener = null;
    }
}

export function applyThemePreference(preference: ThemePreference) {
    clearSystemListener();

    if (preference === 'system') {
        const mediaQuery = getMediaQueryList();
        applyResolvedTheme(mediaQuery.matches);

        const handleChange = (event: MediaQueryListEvent) => {
            applyResolvedTheme(event.matches);
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange);
            detachSystemListener = () => mediaQuery.removeEventListener('change', handleChange);
            return;
        }

        // Legacy Safari fallback
        mediaQuery.addListener(handleChange);
        detachSystemListener = () => mediaQuery.removeListener(handleChange);
        return;
    }

    applyResolvedTheme(preference === 'dark');
}

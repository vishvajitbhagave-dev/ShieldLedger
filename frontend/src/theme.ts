export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'shieldledger.theme';

const THEME_COLORS: Record<Theme, string> = {
  light: '#f7f8fa',
  dark: '#0b1424',
};

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

export function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the toggle still applies for this session.
  }
}

export function toggleTheme(): Theme {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  storeTheme(next);
  return next;
}

export function followSystemTheme(): void {
  if (typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event: MediaQueryListEvent): void => {
    if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
  };
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
  } else if (typeof query.addListener === 'function') {
    query.addListener(onChange);
  }
}
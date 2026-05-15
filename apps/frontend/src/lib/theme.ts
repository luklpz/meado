import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'auto' | 'dark' | 'light' | 'blue' | 'purple';

export interface ThemeOption {
	value: Theme;
	label: string;
	icon: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
	{ value: 'auto',   label: 'Sistema',  icon: '◐' },
	{ value: 'dark',   label: 'Oscuro',   icon: '●' },
	{ value: 'light',  label: 'Claro',    icon: '○' },
	{ value: 'blue',   label: 'Azul',     icon: '◈' },
	{ value: 'purple', label: 'Violeta',  icon: '◉' },
];

function getSystemTheme(): 'dark' | 'light' {
	if (browser && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
	return 'dark';
}

function resolveTheme(theme: Theme): 'dark' | 'light' | 'blue' | 'purple' {
	return theme === 'auto' ? getSystemTheme() : theme;
}

function createThemeStore() {
	const stored = browser ? (localStorage.getItem('meado-theme') as Theme | null) : null;
	const initial: Theme = stored ?? 'auto';
	const { subscribe, set: _set } = writable<Theme>(initial);

	function apply(theme: Theme) {
		if (!browser) return;
		document.documentElement.setAttribute('data-theme', resolveTheme(theme));
	}

	if (browser) apply(initial);

	// Also react to system theme changes when mode is 'auto'
	if (browser) {
		window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
			const current = (localStorage.getItem('meado-theme') as Theme | null) ?? 'auto';
			if (current === 'auto') apply('auto');
		});
	}

	return {
		subscribe,
		set(theme: Theme) {
			_set(theme);
			apply(theme);
			if (browser) localStorage.setItem('meado-theme', theme);
		},
	};
}

export const themeStore = createThemeStore();

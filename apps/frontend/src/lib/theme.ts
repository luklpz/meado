import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeBase   = 'noche' | 'dia';
export type ThemeAccent = 'azul' | 'naranja' | 'verde' | 'morado' | 'rosa' | 'turquesa';

/* Legacy alias kept so existing imports compile without changes */
export type Theme = ThemeBase;

export interface BaseOption {
	value: ThemeBase;
	label: string;
}

export interface AccentOption {
	value:  ThemeAccent;
	label:  string;
	color:  string;
}

export const BASE_OPTIONS: BaseOption[] = [
	{ value: 'noche', label: 'Noche' },
	{ value: 'dia',   label: 'Día'   },
];

export const ACCENT_OPTIONS: AccentOption[] = [
	{ value: 'azul',     label: 'Azul',     color: '#3b82f6' },
	{ value: 'naranja',  label: 'Naranja',  color: '#e8833f' },
	{ value: 'verde',    label: 'Verde',    color: '#2fa86a' },
	{ value: 'morado',   label: 'Morado',   color: '#8b5cf6' },
	{ value: 'rosa',     label: 'Rosa',     color: '#e0568f' },
	{ value: 'turquesa', label: 'Turquesa', color: '#16a89f' },
];

/* Legacy THEME_OPTIONS alias — kept for any remaining references */
export const THEME_OPTIONS = BASE_OPTIONS.map(b => ({
	value: b.value as Theme,
	label: b.label,
	icon:  b.value === 'noche' ? '●' : '○',
}));

/* ── Migrate old single-axis theme to 2-axis on first read ── */
function migrateOldTheme() {
	if (!browser) return;
	const old = localStorage.getItem('meado-theme');
	if (!old) return;
	if (!localStorage.getItem('meado-base')) {
		localStorage.setItem('meado-base', old === 'light' ? 'dia' : 'noche');
	}
	if (!localStorage.getItem('meado-accent')) {
		localStorage.setItem('meado-accent', old === 'purple' ? 'morado' : 'azul');
	}
}

function createBaseStore() {
	if (browser) migrateOldTheme();
	const key     = 'meado-base';
	const stored  = browser ? (localStorage.getItem(key) as ThemeBase | null) : null;
	const initial: ThemeBase = stored ?? 'noche';
	const { subscribe, set: _set } = writable<ThemeBase>(initial);

	function apply(base: ThemeBase) {
		if (!browser) return;
		document.documentElement.setAttribute('data-base', base);
	}

	if (browser) apply(initial);

	return {
		subscribe,
		set(base: ThemeBase) {
			_set(base);
			apply(base);
			if (browser) localStorage.setItem(key, base);
		},
	};
}

function createAccentStore() {
	const key     = 'meado-accent';
	const stored  = browser ? (localStorage.getItem(key) as ThemeAccent | null) : null;
	const initial: ThemeAccent = stored ?? 'azul';
	const { subscribe, set: _set } = writable<ThemeAccent>(initial);

	function apply(accent: ThemeAccent) {
		if (!browser) return;
		document.documentElement.setAttribute('data-accent', accent);
	}

	if (browser) apply(initial);

	return {
		subscribe,
		set(accent: ThemeAccent) {
			_set(accent);
			apply(accent);
			if (browser) localStorage.setItem(key, accent);
		},
	};
}

export const themeBase   = createBaseStore();
export const themeAccent = createAccentStore();

/* Legacy themeStore alias — maps to themeBase for backward compatibility */
export const themeStore = themeBase;

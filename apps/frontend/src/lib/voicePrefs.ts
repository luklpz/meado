import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function persistedBool(key: string, defaultVal: boolean) {
	const initial = browser
		? localStorage.getItem(key) === 'true' ? true
			: localStorage.getItem(key) === 'false' ? false
			: defaultVal
		: defaultVal;

	const store = writable(initial);

	if (browser) {
		store.subscribe(v => localStorage.setItem(key, String(v)));
	}

	return store;
}

export const micMuted = persistedBool('meado_mic_muted', false);
export const deafened = persistedBool('meado_deafened', false);

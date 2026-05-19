import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function persistedBool(key: string, defaultVal: boolean) {
	const initial = browser
		? localStorage.getItem(key) === 'true' ? true
			: localStorage.getItem(key) === 'false' ? false
			: defaultVal
		: defaultVal;
	const store = writable(initial);
	if (browser) store.subscribe(v => localStorage.setItem(key, String(v)));
	return store;
}

function persistedString<T extends string>(key: string, defaultVal: T) {
	const initial = browser ? (localStorage.getItem(key) as T | null) ?? defaultVal : defaultVal;
	const store = writable<T>(initial);
	if (browser) store.subscribe(v => localStorage.setItem(key, v));
	return store;
}

export const micMuted = persistedBool('meado_mic_muted', false);
export const deafened = persistedBool('meado_deafened', false);

export type UserStatus = 'online' | 'away' | 'dnd' | 'invisible';
export const userStatus = persistedString<UserStatus>('meado_user_status', 'online');

export const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; description?: string }> = {
	online:    { label: 'En línea',     color: '#23a559' },
	away:      { label: 'Ausente',      color: '#f0b232' },
	dnd:       { label: 'No molestar',  color: '#f23f43', description: 'No recibirás notificaciones' },
	invisible: { label: 'Invisible',    color: '#82858e', description: 'Aparecerás como desconectado' },
};

import { writable } from 'svelte/store';

export interface AuthUser {
	id: string;
	username: string;
	role: string;
}

// API base: '/api' proxied en dev, reescrito en prod por Vercel
const API = '/api';

function createAuthStore() {
	const user = writable<AuthUser | null>(null);
	let _socketToken: string | null = null;

	// Llama a /api/auth/me para sincronizar el estado con la sesión actual
	async function init(): Promise<AuthUser | null> {
		try {
			const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
			if (!res.ok) { user.set(null); return null; }
			const data = await res.json();
			user.set({ id: data.id, username: data.username, role: data.role });
			_socketToken = data.socketToken ?? null;
			return { id: data.id, username: data.username, role: data.role };
		} catch {
			user.set(null);
			return null;
		}
	}

	async function login(email: string, password: string): Promise<AuthUser> {
		const res = await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ email, password }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Login failed');
		}
		const data = await res.json();
		user.set(data);
		await init(); // fetch socketToken
		return data;
	}

	async function register(username: string, email: string, password: string): Promise<{ message: string }> {
		const res = await fetch(`${API}/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ username, email, password }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Registration failed');
		}
		return res.json();
	}

	async function logout(): Promise<void> {
		await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
		user.set(null);
		_socketToken = null;
	}

	async function forgotPassword(email: string): Promise<{ message: string }> {
		const res = await fetch(`${API}/auth/forgot-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ email }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Error sending reset email');
		}
		return res.json();
	}

	async function resetPassword(token: string, password: string): Promise<{ message: string }> {
		const res = await fetch(`${API}/auth/reset-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ token, password }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Error resetting password');
		}
		return res.json();
	}

	function getSocketToken(): string | null {
		return _socketToken;
	}

	return { user, init, login, register, logout, getSocketToken, forgotPassword, resetPassword };
}

export const authStore = createAuthStore();

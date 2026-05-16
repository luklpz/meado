import { writable } from 'svelte/store';

export interface AuthUser {
	id: string;
	username: string;
	name?: string | null;
	role: string;
	avatarUrl?: string | null;
}

const API = '/api';

function createAuthStore() {
	const user = writable<AuthUser | null>(null);
	let _socketToken: string | null = null;

	async function init(): Promise<AuthUser | null> {
		try {
			const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
			if (!res.ok) { user.set(null); return null; }
			const data = await res.json();
			const u: AuthUser = { id: data.id, username: data.username, name: data.name, role: data.role, avatarUrl: data.avatarUrl };
			user.set(u);
			_socketToken = data.socketToken ?? null;
			return u;
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
		await init();
		return data;
	}

	async function register(username: string, email: string, password: string, name?: string): Promise<{ message: string }> {
		const res = await fetch(`${API}/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ username, email, password, name: name?.trim() || undefined }),
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

	async function updateAvatar(file: File): Promise<void> {
		const formData = new FormData();
		formData.append('file', file);
		const res = await fetch(`${API}/auth/avatar`, {
			method: 'PATCH',
			credentials: 'include',
			body: formData,
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Error al subir la imagen.');
		}
		const data = await res.json();
		user.update(u => u ? { ...u, avatarUrl: data.avatarUrl } : u);
	}

	async function updateProfile(name: string): Promise<void> {
		const res = await fetch(`${API}/auth/profile`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ name: name.trim() || null }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? 'Error al actualizar el perfil.');
		}
		const data = await res.json();
		user.update(u => u ? { ...u, name: data.name } : u);
	}

	function getSocketToken(): string | null {
		return _socketToken;
	}

	return { user, init, login, register, logout, getSocketToken, forgotPassword, resetPassword, updateAvatar, updateProfile };
}

export const authStore = createAuthStore();

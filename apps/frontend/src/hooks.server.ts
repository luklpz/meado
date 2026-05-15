import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('token');
	if (token) {
		try {
			const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
			const res = await fetch(`${backendUrl}/auth/me`, {
				headers: { Cookie: `token=${token}` },
			});
			if (res.ok) {
				const data = await res.json();
				event.locals.user = { id: data.id, username: data.username, role: data.role, avatarUrl: data.avatarUrl ?? null };
			} else {
				event.locals.user = null;
			}
		} catch {
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}
	return resolve(event);
};

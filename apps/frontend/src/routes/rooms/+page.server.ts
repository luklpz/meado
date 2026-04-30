import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');

	const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
	const token = cookies.get('token') ?? '';

	const res = await fetch(`${backendUrl}/rooms`, {
		headers: { Cookie: `token=${token}` },
	});

	const rooms = res.ok ? await res.json() : [];
	return { user: locals.user, rooms };
};

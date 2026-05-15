import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');

	const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
	const token = cookies.get('token') ?? '';

	const res = await fetch(`${backendUrl}/servers`, {
		headers: { Cookie: `token=${token}` },
	});

	const servers = res.ok ? await res.json() : [];
	return { user: locals.user, servers };
};

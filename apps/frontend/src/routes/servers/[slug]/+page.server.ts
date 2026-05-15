import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	if (!locals.user) redirect(302, '/login');

	const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
	const token = cookies.get('token') ?? '';

	const res = await fetch(`${backendUrl}/servers/${params.slug}`, {
		headers: { Cookie: `token=${token}` },
	});

	if (!res.ok) redirect(302, '/servers');
	const server = await res.json();

	// Auto-join public servers so socket ops work
	if (server.accessType === 'PUBLIC') {
		await fetch(`${backendUrl}/servers/${params.slug}/join`, {
			method: 'POST',
			headers: { Cookie: `token=${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		}).catch(() => {});
	}

	return { user: locals.user, server };
};

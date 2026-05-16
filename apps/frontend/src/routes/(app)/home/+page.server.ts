import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) redirect(302, '/login');

  const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
  const token = cookies.get('token') ?? '';
  const headers = { Cookie: `token=${token}` };

  const [friendsRes, pendingRes, dmsRes] = await Promise.all([
    fetch(`${backendUrl}/friends`, { headers }),
    fetch(`${backendUrl}/friends/pending`, { headers }),
    fetch(`${backendUrl}/dm`, { headers }),
  ]);

  return {
    user: locals.user,
    friends: friendsRes.ok ? await friendsRes.json() : [],
    pending: pendingRes.ok ? await pendingRes.json() : [],
    conversations: dmsRes.ok ? await dmsRes.json() : [],
  };
};

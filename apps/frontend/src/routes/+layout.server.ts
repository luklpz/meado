import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) return { user: null, servers: [] };

  const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
  const token = cookies.get('token') ?? '';
  const res = await fetch(`${backendUrl}/servers`, {
    headers: { Cookie: `token=${token}` },
  });
  const servers = res.ok ? await res.json() : [];
  return { user: locals.user, servers };
};

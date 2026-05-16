import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
  if (!locals.user) redirect(302, '/login');

  const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
  const token = cookies.get('token') ?? '';
  const headers = { Cookie: `token=${token}` };

  const [convRes, msgsRes] = await Promise.all([
    fetch(`${backendUrl}/dm`, { headers }),
    fetch(`${backendUrl}/dm/${params.id}/messages?limit=50`, { headers }),
  ]);

  if (!msgsRes.ok) error(403, 'No tienes acceso a esta conversación');

  const conversations = convRes.ok ? await convRes.json() : [];
  const conv = conversations.find((c: any) => c.id === params.id);
  if (!conv) error(404, 'Conversación no encontrada');

  return {
    user: locals.user,
    conversation: conv,
    conversations,
    messages: await msgsRes.json(),
  };
};

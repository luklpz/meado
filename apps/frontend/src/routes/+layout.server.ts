import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) return { user: null, servers: [] };

  const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
  const token = cookies.get('token') ?? '';
  const res = await fetch(`${backendUrl}/servers`, {
    headers: { Cookie: `token=${token}` },
  });
  const servers: any[] = res.ok ? await res.json() : [];
  const memberServers = servers.filter(s => s.isMember);

  // Fetch unread totals for all member servers in parallel
  const unreadMap: Record<string, number> = {};
  await Promise.all(memberServers.map(async (srv) => {
    try {
      const r = await fetch(`${backendUrl}/servers/${srv.slug}/unread`, {
        headers: { Cookie: `token=${token}` },
      });
      if (!r.ok) return;
      const counts: { channelId: string; count: number }[] = await r.json();
      const total = counts.reduce((a, c) => a + c.count, 0);
      if (total > 0) unreadMap[srv.id] = total;
    } catch { /* non-critical */ }
  }));

  return { user: locals.user, servers, serverUnread: unreadMap };
};

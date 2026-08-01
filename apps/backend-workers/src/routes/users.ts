import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from '../hono-env.js';
import { requireAuth } from '../middleware/auth.js';
import { createDb } from '../lib/db.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export const users = new Hono<HonoEnv>();
users.use('*', requireAuth);

async function getAcceptedFriendIds(db: PrismaClient, userId: string): Promise<string[]> {
	const friendships = await db.friendship.findMany({
		where: { OR: [{ senderId: userId }, { receiverId: userId }], status: 'ACCEPTED' },
		select: { senderId: true, receiverId: true },
	});
	return friendships.map((f) => (f.senderId === userId ? f.receiverId : f.senderId));
}

users.get('/search', async (c) => {
	const q = c.req.query('q') ?? '';
	const me = c.get('user');
	if (q.trim().length < 2) return c.json([]);
	const query = q.trim();
	const isEmail = query.includes('@');

	const db = createDb(c.env);
	const list = await db.user.findMany({
		where: isEmail
			? { email: query.toLowerCase(), emailVerified: true, id: { not: me.id } }
			: { username: { contains: query, mode: 'insensitive' }, emailVerified: true, id: { not: me.id } },
		select: { id: true, username: true, name: true, avatarUrl: true },
		take: 8,
	});
	return c.json(list);
});

users.get('/:id/profile', async (c) => {
	const targetId = c.req.param('id');
	const viewerId = c.get('user').id;
	const db = createDb(c.env);

	const target = await db.user.findUnique({
		where: { id: targetId },
		select: { id: true, username: true, name: true, avatarUrl: true, bio: true, pronouns: true, bannerColor: true, createdAt: true },
	});
	if (!target) throw new HTTPException(404, { message: 'Usuario no encontrado' });

	const friendship = await db.friendship.findFirst({
		where: { OR: [{ senderId: viewerId, receiverId: targetId }, { senderId: targetId, receiverId: viewerId }] },
		select: { id: true, status: true, senderId: true },
	});

	let friendshipStatus = 'none';
	if (friendship) {
		if (friendship.status === 'ACCEPTED') friendshipStatus = 'accepted';
		else if (friendship.status === 'PENDING') friendshipStatus = friendship.senderId === viewerId ? 'pending_sent' : 'pending_received';
		else if (friendship.status === 'BLOCKED') friendshipStatus = friendship.senderId === viewerId ? 'blocked_by_me' : 'blocked_by_them';
	}
	const isBlocked = friendshipStatus === 'blocked_by_me' || friendshipStatus === 'blocked_by_them';

	const [viewerFriendIds, targetFriendIds] = isBlocked
		? [[], []]
		: await Promise.all([getAcceptedFriendIds(db, viewerId), getAcceptedFriendIds(db, targetId)]);
	const mutualFriendIdSet = new Set(targetFriendIds);
	const mutualFriendIds = viewerFriendIds.filter((id) => mutualFriendIdSet.has(id));

	const mutualFriends = mutualFriendIds.length > 0
		? await db.user.findMany({ where: { id: { in: mutualFriendIds } }, select: { id: true, username: true, name: true, avatarUrl: true }, take: 6 })
		: [];

	const viewerServerIds = isBlocked ? [] : (await db.serverMember.findMany({ where: { userId: viewerId }, select: { serverId: true } })).map((m) => m.serverId);
	const mutualServers = viewerServerIds.length > 0
		? (await db.serverMember.findMany({ where: { userId: targetId, serverId: { in: viewerServerIds } }, include: { server: { select: { id: true, name: true, slug: true, iconUrl: true } } }, take: 5 })).map((m) => m.server)
		: [];

	return c.json({ ...target, friendshipStatus, friendshipId: friendship?.id ?? null, mutualFriends, mutualServers });
});

users.post('/:id/report', async (c) => {
	const targetId = c.req.param('id');
	const reporterId = c.get('user').id;
	const body = await c.req.json<{ reason?: string; details?: string }>();

	if (reporterId === targetId) throw new HTTPException(400, { message: 'Cannot report yourself' });
	if (!body.reason?.trim()) throw new HTTPException(400, { message: 'reason is required' });

	const db = createDb(c.env);
	const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
	if (!target) throw new HTTPException(404, { message: 'Usuario no encontrado' });

	const recent = await db.report.findFirst({ where: { reporterId, targetUserId: targetId }, orderBy: { createdAt: 'desc' } });
	if (recent) {
		const hoursSince = (Date.now() - recent.createdAt.getTime()) / 3600000;
		if (hoursSince < 24) throw new HTTPException(409, { message: 'Ya has reportado a este usuario recientemente' });
	}

	await db.report.create({ data: { reporterId, targetUserId: targetId, reason: body.reason.trim(), details: body.details?.trim() || null } });
	return c.json({ ok: true });
});

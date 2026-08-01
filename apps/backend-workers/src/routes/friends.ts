import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from '../hono-env.js';
import { requireAuth } from '../middleware/auth.js';
import { createDb } from '../lib/db.js';
import { getFriendIds } from '../lib/friends.js';
import { notifyUser, getOnlineFlags } from '../lib/broadcast.js';

const USER_SELECT = { id: true, username: true, name: true, avatarUrl: true } as const;

export const friends = new Hono<HonoEnv>();
friends.use('*', requireAuth);

friends.get('/', async (c) => {
	const me = c.get('user');
	const db = createDb(c.env);
	const rows = await db.friendship.findMany({
		where: { status: 'ACCEPTED', OR: [{ senderId: me.id }, { receiverId: me.id }] },
		include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
	});
	const friendIds = rows.map((f) => (f.senderId === me.id ? f.receiverId : f.senderId));
	const online = await getOnlineFlags(c.env, friendIds);
	const result = rows.map((f) => {
		const isSender = f.senderId === me.id;
		const friend = isSender ? f.receiver : f.sender;
		const alias = isSender ? f.aliasBySender : f.aliasByReceiver;
		return { id: f.id, alias, user: { ...friend, online: online.has(friend.id) } };
	});
	return c.json(result);
});

friends.get('/pending', async (c) => {
	const me = c.get('user');
	const db = createDb(c.env);
	const rows = await db.friendship.findMany({
		where: { status: 'PENDING', OR: [{ senderId: me.id }, { receiverId: me.id }] },
		include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
	});
	return c.json(rows.map((f) => ({
		id: f.id,
		direction: f.senderId === me.id ? 'outgoing' : 'incoming',
		user: f.senderId === me.id ? f.receiver : f.sender,
		createdAt: f.createdAt,
	})));
});

friends.post('/request', async (c) => {
	const me = c.get('user');
	const { identifier } = await c.req.json<{ identifier?: string }>();
	if (!identifier) throw new HTTPException(400, { message: 'identifier required' });

	const db = createDb(c.env);
	const isEmail = identifier.includes('@');
	const receiver = await db.user.findFirst({ where: isEmail ? { email: identifier.toLowerCase() } : { username: identifier } });
	if (!receiver) throw new HTTPException(404, { message: 'User not found' });
	if (receiver.id === me.id) throw new HTTPException(400, { message: 'Cannot add yourself' });

	const existing = await db.friendship.findFirst({ where: { OR: [{ senderId: me.id, receiverId: receiver.id }, { senderId: receiver.id, receiverId: me.id }] } });
	if (existing) {
		if (existing.status === 'ACCEPTED') throw new HTTPException(400, { message: 'Already friends' });
		if (existing.status === 'PENDING') throw new HTTPException(400, { message: 'Request already pending' });
		throw new HTTPException(400, { message: 'Cannot send request' });
	}

	const friendship = await db.friendship.create({
		data: { senderId: me.id, receiverId: receiver.id },
		include: { receiver: { select: USER_SELECT }, sender: { select: USER_SELECT } },
	});

	notifyUser(c.env, friendship.receiverId, 'friend:request', {
		id: friendship.id,
		user: { id: friendship.sender.id, username: friendship.sender.username, avatarUrl: friendship.sender.avatarUrl ?? null },
		createdAt: friendship.createdAt.toISOString(),
	});
	return c.json(friendship);
});

friends.post('/accept/:id', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const db = createDb(c.env);
	const friendship = await db.friendship.findUnique({ where: { id } });
	if (!friendship) throw new HTTPException(404, { message: 'Request not found' });
	if (friendship.receiverId !== me.id) throw new HTTPException(403, { message: 'Not your request' });
	if (friendship.status !== 'PENDING') throw new HTTPException(400, { message: 'Not a pending request' });
	const updated = await db.friendship.update({ where: { id }, data: { status: 'ACCEPTED' }, include: { sender: { select: USER_SELECT } } });
	return c.json(updated);
});

friends.patch('/:id/alias', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const { alias } = await c.req.json<{ alias?: string | null }>();
	const db = createDb(c.env);
	const friendship = await db.friendship.findUnique({ where: { id } });
	if (!friendship) throw new HTTPException(404, { message: 'Friendship not found' });
	if (friendship.senderId !== me.id && friendship.receiverId !== me.id) throw new HTTPException(403, { message: 'Not your friendship' });
	const field = friendship.senderId === me.id ? 'aliasBySender' : 'aliasByReceiver';
	const updated = await db.friendship.update({ where: { id }, data: { [field]: alias?.trim() || null } });
	return c.json(updated);
});

friends.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const db = createDb(c.env);
	const friendship = await db.friendship.findUnique({ where: { id } });
	if (!friendship) throw new HTTPException(404, { message: 'Friendship not found' });
	if (friendship.senderId !== me.id && friendship.receiverId !== me.id) throw new HTTPException(403, { message: 'Not your friendship' });
	await db.friendship.delete({ where: { id } });
	return c.json({ ok: true });
});

friends.post('/block/:targetId', async (c) => {
	const targetId = c.req.param('targetId');
	const me = c.get('user');
	if (me.id === targetId) throw new HTTPException(400, { message: 'Cannot block yourself' });

	const db = createDb(c.env);
	const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
	if (!target) throw new HTTPException(404, { message: 'User not found' });

	const existing = await db.friendship.findFirst({ where: { OR: [{ senderId: me.id, receiverId: targetId }, { senderId: targetId, receiverId: me.id }] } });
	if (existing) {
		if (existing.status === 'BLOCKED' && existing.senderId === me.id) return c.json({ ok: true });
		await db.friendship.delete({ where: { id: existing.id } });
	}
	await db.friendship.create({ data: { senderId: me.id, receiverId: targetId, status: 'BLOCKED' } });
	return c.json({ ok: true });
});

friends.delete('/block/:targetId', async (c) => {
	const targetId = c.req.param('targetId');
	const me = c.get('user');
	const db = createDb(c.env);
	const friendship = await db.friendship.findFirst({ where: { senderId: me.id, receiverId: targetId, status: 'BLOCKED' } });
	if (!friendship) throw new HTTPException(404, { message: 'Block not found' });
	await db.friendship.delete({ where: { id: friendship.id } });
	return c.json({ ok: true });
});

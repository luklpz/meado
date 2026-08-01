import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from '../hono-env.js';
import { requireAuth } from '../middleware/auth.js';
import { createDb } from '../lib/db.js';
import { deleteManyByUrls } from '../lib/storage.js';
import { getFriendIds } from '../lib/friends.js';
import { broadcastDmMessageCreated, broadcastDmMessageUpdated, broadcastDmMessageDeleted, broadcastDmMemberAdded } from '../lib/broadcast.js';
import { formatReactions } from '../lib/messages.js';
import { DM_MSG_SELECT, isDmMember as isMember } from '../lib/dm-messages.js';

function parseCursor(cursor: string): Date {
	const d = new Date(cursor);
	if (isNaN(d.getTime())) throw new HTTPException(400, { message: 'Invalid cursor' });
	return d;
}

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';
function isAllowedAttachmentUrl(url: string) {
	return url.startsWith(CLOUDINARY_PREFIX) || url.startsWith(DRIVE_PREFIX);
}

export const dm = new Hono<HonoEnv>();
dm.use('*', requireAuth);

dm.get('/', async (c) => {
	const me = c.get('user');
	const db = createDb(c.env);
	const convs = await db.directConversation.findMany({
		where: { members: { some: { userId: me.id } } },
		include: {
			members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } },
			messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, content: true, createdAt: true, author: { select: { username: true, name: true } } } },
		},
		orderBy: { updatedAt: 'desc' },
	});
	return c.json(convs.map((cv) => ({ id: cv.id, name: cv.name, members: cv.members.map((m) => m.user), lastMessage: cv.messages[0] ?? null })));
});

dm.get('/:id/messages', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const before = c.req.query('before');
	const limitRaw = c.req.query('limit');
	const parsedLimit = limitRaw ? parseInt(limitRaw, 10) : 50;
	const limit = Number.isNaN(parsedLimit) ? 50 : parsedLimit;

	const db = createDb(c.env);
	if (!(await isMember(db, id, me.id))) throw new HTTPException(403, { message: 'Not a member' });

	const msgs = await db.directMessage.findMany({
		where: { conversationId: id, ...(before ? { createdAt: { lt: parseCursor(before) } } : {}) },
		orderBy: { createdAt: 'desc' },
		take: Math.min(limit, 100),
		select: DM_MSG_SELECT,
	});
	return c.json(msgs.reverse().map((m) => ({ ...m, reactions: formatReactions(m.reactions, me.id) })));
});

dm.post('/', async (c) => {
	const me = c.get('user');
	const body = await c.req.json<{ userIds?: string[]; name?: string; group?: boolean }>();
	const userIds = body.userIds ?? [];
	const db = createDb(c.env);

	if (body.group) {
		const allIds = [...new Set([me.id, ...userIds])].sort();
		if (allIds.length < 2) throw new HTTPException(400, { message: 'Need at least one other user' });
		const friendIds = await getFriendIds(db, me.id);
		const nonFriends = userIds.filter((id) => id !== me.id && !friendIds.includes(id));
		if (nonFriends.length) throw new HTTPException(403, { message: 'Can only add friends to group' });
		const group = await db.directConversation.create({
			data: { name: body.name ?? null, members: { createMany: { data: allIds.map((uid) => ({ userId: uid })) } } },
			include: { members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } } },
		});
		return c.json(group);
	}

	const allIds = [...new Set([me.id, ...userIds])].sort();
	if (allIds.length < 2) throw new HTTPException(400, { message: 'Need at least one other user' });
	const MEMBER_INCLUDE = { members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } } };

	if (allIds.length === 2) {
		const canonicalKey = allIds.join(':');
		const existing = await db.directConversation.findUnique({ where: { canonicalKey }, include: MEMBER_INCLUDE });
		if (existing) return c.json(existing);
		try {
			const created = await db.directConversation.create({ data: { canonicalKey, members: { createMany: { data: allIds.map((uid) => ({ userId: uid })) } } }, include: MEMBER_INCLUDE });
			return c.json(created);
		} catch (e) {
			if ((e as { code?: string }).code === 'P2002') {
				const winner = await db.directConversation.findUniqueOrThrow({ where: { canonicalKey }, include: MEMBER_INCLUDE });
				return c.json(winner);
			}
			throw e;
		}
	}

	const created = await db.directConversation.create({ data: { members: { createMany: { data: allIds.map((uid) => ({ userId: uid })) } } }, include: MEMBER_INCLUDE });
	return c.json(created);
});

dm.post('/:id/messages', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const body = await c.req.json<{ content?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number; attachmentMimeType?: string }>();

	const db = createDb(c.env);
	if (!(await isMember(db, id, me.id))) throw new HTTPException(403, { message: 'Not a member' });

	let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;
	if (body.attachmentUrl && body.attachmentName) {
		if (!isAllowedAttachmentUrl(body.attachmentUrl)) throw new HTTPException(400, { message: 'Invalid attachment URL' });
		attachments = [{ url: body.attachmentUrl, name: body.attachmentName, size: body.attachmentSize ?? 0, mimeType: body.attachmentMimeType ?? 'application/octet-stream' }];
	}
	if (!body.content?.trim() && !attachments?.length) throw new HTTPException(400, { message: 'Content or attachment required' });
	if (body.content && body.content.length > 4000) throw new HTTPException(400, { message: 'Message too long (max 4000 chars)' });

	const msg = await db.directMessage.create({
		data: { conversationId: id, authorId: me.id, content: body.content?.trim() || null, ...(attachments?.length ? { attachments: { create: attachments } } : {}) },
		select: DM_MSG_SELECT,
	});
	await db.directConversation.update({ where: { id }, data: { updatedAt: new Date() } });

	const message = { ...msg, reactions: [] };
	broadcastDmMessageCreated(c.env, id, message);
	return c.json(message);
});

dm.post('/:id/members', async (c) => {
	const id = c.req.param('id');
	const me = c.get('user');
	const { userId } = await c.req.json<{ userId?: string }>();
	if (!userId) throw new HTTPException(400, { message: 'userId required' });

	const db = createDb(c.env);
	if (!(await isMember(db, id, me.id))) throw new HTTPException(403, { message: 'Not a member' });

	const friendIds = await getFriendIds(db, me.id);
	if (!friendIds.includes(userId)) throw new HTTPException(403, { message: 'Can only add friends' });

	const conv = await db.directConversation.findUnique({
		where: { id },
		include: {
			members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } },
			messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true, author: { select: { username: true, name: true } } } },
		},
	});
	if (!conv) throw new HTTPException(404, { message: 'Conversation not found' });
	if (conv.members.some((m) => m.userId === userId)) throw new HTTPException(400, { message: 'Already a member' });

	const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, username: true, name: true, avatarUrl: true } });
	if (!target) throw new HTTPException(404, { message: 'User not found' });

	await db.$transaction([
		db.directConversationMember.create({ data: { conversationId: id, userId } }),
		db.directConversation.update({ where: { id }, data: { canonicalKey: null } }),
	]);

	const conversation = { id: conv.id, name: conv.name, members: [...conv.members.map((m) => m.user), target], lastMessage: conv.messages[0] ?? null };
	broadcastDmMemberAdded(c.env, id, target, conversation);
	return c.json(target);
});

dm.patch('/:id/messages/:messageId', async (c) => {
	const id = c.req.param('id');
	const messageId = c.req.param('messageId');
	const me = c.get('user');
	const { content } = await c.req.json<{ content?: string }>();

	const db = createDb(c.env);
	const msg = await db.directMessage.findUnique({ where: { id: messageId } });
	if (!msg) throw new HTTPException(404, { message: 'Message not found' });
	if (msg.conversationId !== id) throw new HTTPException(403, { message: 'Message not in this conversation' });
	if (msg.authorId !== me.id) throw new HTTPException(403, { message: 'Not your message' });
	if (!(await isMember(db, id, me.id))) throw new HTTPException(403, { message: 'Not a member' });
	if (!content?.trim()) throw new HTTPException(400, { message: 'Content required' });
	if (content.length > 4000) throw new HTTPException(400, { message: 'Message too long (max 4000 chars)' });

	const updated = await db.directMessage.update({ where: { id: messageId }, data: { content: content.trim(), editedAt: new Date() }, select: DM_MSG_SELECT });
	const message = { ...updated, reactions: formatReactions(updated.reactions, me.id) };
	broadcastDmMessageUpdated(c.env, message.conversationId, message);
	return c.json(message);
});

dm.delete('/:id/messages/:messageId', async (c) => {
	const id = c.req.param('id');
	const messageId = c.req.param('messageId');
	const me = c.get('user');

	const db = createDb(c.env);
	const msg = await db.directMessage.findUnique({ where: { id: messageId }, include: { attachments: { select: { url: true } } } });
	if (!msg) throw new HTTPException(404, { message: 'Message not found' });
	if (msg.conversationId !== id) throw new HTTPException(403, { message: 'Message not in this conversation' });
	if (msg.authorId !== me.id) throw new HTTPException(403, { message: 'Not your message' });
	if (!(await isMember(db, id, me.id))) throw new HTTPException(403, { message: 'Not a member' });

	const attachmentUrls = msg.attachments.map((a) => a.url);
	await db.directMessage.delete({ where: { id: messageId } });
	if (attachmentUrls.length) await deleteManyByUrls(c.env, attachmentUrls);

	broadcastDmMessageDeleted(c.env, msg.conversationId, messageId);
	return c.json({ ok: true, messageId, conversationId: msg.conversationId });
});

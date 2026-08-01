import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AccessToken } from 'livekit-server-sdk';
import type { HonoEnv } from '../hono-env.js';
import type { Env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { createDb } from '../lib/db.js';
import { deleteManyByUrls } from '../lib/storage.js';
import { broadcastMessageCreated, broadcastMessageUpdated, broadcastMessageDeleted } from '../lib/broadcast.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export const channels = new Hono<HonoEnv>();
channels.use('*', requireAuth);

const MSG_SELECT = {
	id: true, content: true, createdAt: true, editedAt: true, channelId: true,
	author: { select: { id: true, username: true, name: true, avatarUrl: true } },
	attachments: { select: { id: true, url: true, name: true, size: true, mimeType: true } },
	reactions: { select: { userId: true, emoji: true } },
} as const;

function formatReactions(raw: { userId: string; emoji: string }[], userId: string) {
	const map = new Map<string, { count: number; me: boolean }>();
	for (const r of raw) {
		const entry = map.get(r.emoji) ?? { count: 0, me: false };
		entry.count++;
		if (r.userId === userId) entry.me = true;
		map.set(r.emoji, entry);
	}
	return Array.from(map.entries()).map(([emoji, { count, me }]) => ({ emoji, count, me }));
}

function parseCursor(cursor: string): Date {
	const d = new Date(cursor);
	if (isNaN(d.getTime())) throw new HTTPException(400, { message: 'Invalid cursor' });
	return d;
}

export async function verifyChannelMember(db: PrismaClient, channelId: string, userId: string): Promise<boolean> {
	const channel = await db.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
	if (!channel) return false;
	const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId, serverId: channel.serverId } } });
	return !!member;
}

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';
function isAllowedAttachmentUrl(url: string) {
	return url.startsWith(CLOUDINARY_PREFIX) || url.startsWith(DRIVE_PREFIX);
}

function livekitEnv(env: Env) {
	if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
		throw new HTTPException(500, { message: 'LiveKit not configured' });
	}
	return { apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, url: env.LIVEKIT_URL };
}

channels.patch('/:channelId/read', async (c) => {
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const db = createDb(c.env);
	if (await verifyChannelMember(db, channelId, me.id)) {
		await db.channelRead.upsert({ where: { userId_channelId: { userId: me.id, channelId } }, create: { userId: me.id, channelId }, update: {} });
	}
	return c.json({ ok: true });
});

channels.get('/:channelId/messages', async (c) => {
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const before = c.req.query('before');
	const limitRaw = c.req.query('limit');
	const parsedLimit = limitRaw ? parseInt(limitRaw, 10) : 50;
	const limit = Number.isNaN(parsedLimit) ? 50 : parsedLimit;

	const db = createDb(c.env);
	if (!(await verifyChannelMember(db, channelId, me.id))) throw new HTTPException(403, { message: 'Not a member of this server' });

	const msgs = await db.message.findMany({
		where: { channelId, ...(before ? { createdAt: { lt: parseCursor(before) } } : {}) },
		orderBy: { createdAt: 'desc' },
		take: Math.min(limit, 100),
		select: MSG_SELECT,
	});
	return c.json(msgs.reverse().map((m) => ({ ...m, reactions: formatReactions(m.reactions, me.id) })));
});

channels.post('/:channelId/messages', async (c) => {
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const body = await c.req.json<{ content?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number; attachmentMimeType?: string }>();

	if (!body.content?.trim() && !(body.attachmentUrl && body.attachmentName)) {
		throw new HTTPException(400, { message: 'Message must have content or attachment' });
	}
	if (body.content && body.content.length > 4000) throw new HTTPException(400, { message: 'Message too long (max 4000 chars)' });

	let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;
	if (body.attachmentUrl && body.attachmentName) {
		if (!isAllowedAttachmentUrl(body.attachmentUrl)) throw new HTTPException(400, { message: 'Invalid attachment URL' });
		attachments = [{ url: body.attachmentUrl, name: body.attachmentName, size: body.attachmentSize ?? 0, mimeType: body.attachmentMimeType ?? 'application/octet-stream' }];
	}

	const db = createDb(c.env);
	if (!(await verifyChannelMember(db, channelId, me.id))) throw new HTTPException(403, { message: 'Not a member of this server' });

	const msg = await db.message.create({
		data: { channelId, authorId: me.id, content: body.content?.trim() || null, ...(attachments?.length ? { attachments: { createMany: { data: attachments } } } : {}) },
		select: MSG_SELECT,
	});
	const message = { ...msg, reactions: [] };
	broadcastMessageCreated(c.env, channelId, message);
	return c.json(message);
});

channels.patch('/:channelId/messages/:messageId', async (c) => {
	const channelId = c.req.param('channelId');
	const messageId = c.req.param('messageId');
	const me = c.get('user');
	const { content } = await c.req.json<{ content?: string }>();

	const db = createDb(c.env);
	const msg = await db.message.findUnique({ where: { id: messageId } });
	if (!msg) throw new HTTPException(404, { message: 'Message not found' });
	if (msg.channelId !== channelId) throw new HTTPException(403, { message: 'Message not in this channel' });
	if (msg.authorId !== me.id) throw new HTTPException(403, { message: 'Not your message' });
	if (!(await verifyChannelMember(db, channelId, me.id))) throw new HTTPException(403, { message: 'Not a member' });
	if (!content?.trim()) throw new HTTPException(400, { message: 'Content required' });
	if (content.length > 4000) throw new HTTPException(400, { message: 'Message too long (max 4000 chars)' });

	const updated = await db.message.update({ where: { id: messageId }, data: { content: content.trim(), editedAt: new Date() }, select: MSG_SELECT });
	const message = { ...updated, reactions: formatReactions(updated.reactions, me.id) };
	broadcastMessageUpdated(c.env, message.channelId, message);
	return c.json(message);
});

channels.delete('/:channelId/messages/:messageId', async (c) => {
	const messageId = c.req.param('messageId');
	const me = c.get('user');
	const db = createDb(c.env);

	const msg = await db.message.findUnique({
		where: { id: messageId },
		include: { channel: { include: { server: true } }, attachments: { select: { url: true } } },
	});
	if (!msg) throw new HTTPException(404, { message: 'Message not found' });

	const isAuthor = msg.authorId === me.id;
	const isSuperAdmin = me.role === 'SUPERADMIN';
	const isOwner = msg.channel.server.ownerId === me.id;
	if (!isAuthor && !isSuperAdmin && !isOwner) {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: msg.channel.server.id } }, include: { role: true } });
		const perms = member?.role?.permissions as Record<string, boolean> | null;
		if (!perms?.manageMessages) throw new HTTPException(403, { message: 'Cannot delete this message' });
	}

	const attachmentUrls = msg.attachments.map((a) => a.url);
	await db.message.delete({ where: { id: messageId } });
	if (attachmentUrls.length) await deleteManyByUrls(c.env, attachmentUrls);

	broadcastMessageDeleted(c.env, msg.channelId, messageId);
	return c.json({ ok: true, messageId, channelId: msg.channelId });
});

channels.get('/:channelId/livekit-token', async (c) => {
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const db = createDb(c.env);

	const channel = await db.channel.findUnique({ where: { id: channelId } });
	if (!channel) throw new HTTPException(404, { message: 'Channel not found' });
	if (channel.type !== 'VOICE') throw new HTTPException(403, { message: 'Not a voice channel' });
	if (!(await verifyChannelMember(db, channelId, me.id))) throw new HTTPException(403, { message: 'Not a member of this server' });

	const lk = livekitEnv(c.env);
	const token = new AccessToken(lk.apiKey, lk.apiSecret, { identity: me.id, name: me.username, ttl: '4h' });
	token.addGrant({ roomJoin: true, room: channelId, canPublish: true, canSubscribe: true, canPublishData: true });
	return c.json({ token: await token.toJwt(), url: lk.url });
});

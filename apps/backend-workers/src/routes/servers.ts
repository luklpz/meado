import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AccessToken } from 'livekit-server-sdk';
import type { HonoEnv } from '../hono-env.js';
import type { Env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { createDb } from '../lib/db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { uploadImageToCloudinary } from '../lib/cloudinary.js';
import { deleteManyByUrls } from '../lib/storage.js';
import { DEFAULT_PERMISSIONS, OWNER_PERMISSIONS, type ServerPermissions } from '../shared/permissions.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export const servers = new Hono<HonoEnv>();
servers.use('*', requireAuth);

// ── Permission helpers (reutilizados por channels.ts) ──────────────────────

export async function hasPermission(db: PrismaClient, serverId: string, userId: string, userRole: string, perm: keyof ServerPermissions): Promise<boolean> {
	if (userRole === 'SUPERADMIN') return true;
	const server = await db.server.findUnique({ where: { id: serverId } });
	if (!server) return false;
	if (server.ownerId === userId) return true;
	const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId, serverId } }, include: { role: true } });
	if (!member) return false;
	const perms = member.role?.permissions as ServerPermissions | null;
	return perms?.[perm] ?? false;
}

async function assertPermission(db: PrismaClient, slug: string, userId: string, userRole: string, perm: keyof ServerPermissions) {
	const server = await db.server.findUnique({ where: { slug }, include: { roles: { where: { isDefault: true } } } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	if (userRole === 'SUPERADMIN' || server.ownerId === userId) return server;

	const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId, serverId: server.id } }, include: { role: true } });
	if (!member) throw new HTTPException(403, { message: 'Not a member of this server' });

	const perms = member.role?.permissions as ServerPermissions | null;
	if (!perms?.[perm]) throw new HTTPException(403, { message: `Missing permission: ${perm}` });
	return server;
}

function livekitEnv(env: Env) {
	if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
		throw new HTTPException(500, { message: 'LiveKit not configured' });
	}
	return { apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, url: env.LIVEKIT_URL };
}

async function getServer(db: PrismaClient, slug: string) {
	const server = await db.server.findUnique({
		where: { slug },
		select: {
			id: true, name: true, slug: true, description: true, iconUrl: true, serverType: true, accessType: true, ownerId: true,
			owner: { select: { username: true, avatarUrl: true } },
			channels: { orderBy: { position: 'asc' }, select: { id: true, name: true, type: true, position: true } },
			roles: { orderBy: { position: 'desc' }, select: { id: true, name: true, color: true, position: true, isDefault: true, permissions: true } },
			_count: { select: { members: true } },
		},
	});
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	return server;
}

// ── List / get ───────────────────────────────────────────────────────────

servers.get('/', async (c) => {
	const db = createDb(c.env);
	const userId = c.get('user').id;
	const list = await db.server.findMany({
		select: {
			id: true, name: true, slug: true, description: true, iconUrl: true, serverType: true, accessType: true,
			owner: { select: { username: true } },
			_count: { select: { members: true } },
			members: { where: { userId }, select: { userId: true }, take: 1 },
		},
		orderBy: { createdAt: 'asc' },
	});
	return c.json(list.map(({ members, ...s }) => ({ ...s, isMember: members.length > 0 })));
});

servers.get('/:slug', async (c) => {
	const db = createDb(c.env);
	return c.json(await getServer(db, c.req.param('slug')));
});

servers.get('/:slug/unread', async (c) => {
	const db = createDb(c.env);
	const slug = c.req.param('slug');
	const userId = c.get('user').id;
	const server = await db.server.findUnique({ where: { slug }, select: { id: true } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });

	const rows = await db.$queryRaw<{ channelId: string; count: bigint }[]>`
		SELECT c.id as "channelId", COUNT(m.id) as count
		FROM "Channel" c
		LEFT JOIN "ChannelRead" cr ON cr."channelId" = c.id AND cr."userId" = ${userId}
		LEFT JOIN "Message" m ON m."channelId" = c.id
			AND m."authorId" != ${userId}
			AND (cr."lastReadAt" IS NULL OR m."createdAt" > cr."lastReadAt")
		WHERE c."serverId" = ${server.id} AND c.type::text = 'TEXT'
		GROUP BY c.id
	`;
	return c.json(rows.map((r) => ({ channelId: r.channelId, count: Number(r.count) })));
});

// ── Create ───────────────────────────────────────────────────────────────

servers.post('/', async (c) => {
	const me = c.get('user');
	if (me.role !== 'ADMIN' && me.role !== 'SUPERADMIN') throw new HTTPException(403, { message: 'Forbidden resource' });

	const dto = await c.req.json<{ name?: string; slug?: string; description?: string; serverType?: 'DISCORD' | 'SPATIAL'; accessType?: 'PUBLIC' | 'PASSWORD' | 'WHITELIST'; password?: string }>();
	if (!dto.name?.trim()) throw new HTTPException(400, { message: 'Server name is required' });
	if (dto.name.length > 100) throw new HTTPException(400, { message: 'Server name max 100 characters' });
	if (!dto.slug?.trim()) throw new HTTPException(400, { message: 'Slug is required' });
	if (!/^[a-z0-9-]{2,32}$/.test(dto.slug)) throw new HTTPException(400, { message: 'Slug must be 2-32 lowercase alphanumeric characters or hyphens' });
	if (dto.description && dto.description.length > 500) throw new HTTPException(400, { message: 'Description max 500 characters' });

	const db = createDb(c.env);
	const existing = await db.server.findUnique({ where: { slug: dto.slug } });
	if (existing) throw new HTTPException(409, { message: 'Slug already in use' });

	let passwordHash: string | undefined;
	if (dto.accessType === 'PASSWORD') {
		if (!dto.password) throw new HTTPException(400, { message: 'Password required for PASSWORD access type' });
		passwordHash = await hashPassword(dto.password);
	}

	const server = await db.server.create({
		data: {
			name: dto.name, slug: dto.slug, description: dto.description,
			serverType: dto.serverType ?? 'DISCORD', accessType: dto.accessType ?? 'PUBLIC', passwordHash, ownerId: me.id,
		},
	});

	await db.serverRole.create({ data: { name: '@everyone', position: 0, isDefault: true, permissions: DEFAULT_PERMISSIONS as object, serverId: server.id } });
	const adminRole = await db.serverRole.create({ data: { name: 'Admin', color: '#22c55e', position: 100, isDefault: false, permissions: OWNER_PERMISSIONS as object, serverId: server.id } });
	await db.serverMember.create({ data: { userId: me.id, serverId: server.id, roleId: adminRole.id } });
	await db.channel.createMany({
		data: [
			{ name: 'general', type: 'TEXT', position: 0, serverId: server.id },
			{ name: 'General', type: 'VOICE', position: 1, serverId: server.id },
		],
	});

	return c.json(await getServer(db, server.slug));
});

// ── Icon ─────────────────────────────────────────────────────────────────

servers.patch('/:slug/icon', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const body = await c.req.parseBody();
	const file = body['file'];
	if (!(file instanceof File)) throw new HTTPException(400, { message: 'No se recibió ningún archivo' });
	const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
	if (!allowed.includes(file.type)) throw new HTTPException(400, { message: 'Tipo no permitido. Usa JPEG, PNG, GIF o WebP.' });

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageServer');
	const iconUrl = await uploadImageToCloudinary(c.env, file, { folder: 'meado/icons', publicId: `icon-${server.id}` });
	await db.server.update({ where: { id: server.id }, data: { iconUrl } });
	return c.json({ iconUrl });
});

// ── Update / delete ──────────────────────────────────────────────────────

servers.patch('/:slug', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const data = await c.req.json<{ name?: string; description?: string; accessType?: 'PUBLIC' | 'PASSWORD' | 'WHITELIST'; password?: string }>();

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageServer');

	let passwordHash: string | null | undefined = server.passwordHash;
	if (data.accessType === 'PASSWORD') {
		if (data.password) passwordHash = await hashPassword(data.password);
		else if (!server.passwordHash) throw new HTTPException(400, { message: 'Password required when setting PASSWORD access type' });
	} else if (data.accessType) {
		passwordHash = null;
	}

	const updated = await db.server.update({
		where: { id: server.id },
		data: { name: data.name ?? undefined, description: data.description ?? undefined, accessType: data.accessType ?? undefined, passwordHash },
		select: { id: true, name: true, slug: true, description: true, accessType: true },
	});
	return c.json(updated);
});

servers.delete('/:slug', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	if (server.ownerId !== me.id) throw new HTTPException(403, { message: 'Only the server owner can delete the server' });

	const attachments = await db.attachment.findMany({ where: { message: { channel: { serverId: server.id } } }, select: { url: true } });
	const urls = attachments.map((a) => a.url);
	if (server.iconUrl) urls.push(server.iconUrl);

	await db.server.delete({ where: { id: server.id } });
	if (urls.length) await deleteManyByUrls(c.env, urls);
	return c.json({ ok: true });
});

// ── LiveKit (Spatial servers) ────────────────────────────────────────────

servers.get('/:slug/livekit-token', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const isMember = (await db.serverMember.count({ where: { server: { slug }, userId: me.id } })) > 0;
	if (!isMember) throw new HTTPException(403, { message: 'Not a member' });

	const lk = livekitEnv(c.env);
	const token = new AccessToken(lk.apiKey, lk.apiSecret, { identity: me.id, name: me.username, ttl: '4h' });
	token.addGrant({ roomJoin: true, room: `spatial-${slug}`, canPublish: true, canSubscribe: true, canPublishData: true });
	return c.json({ token: await token.toJwt(), url: lk.url });
});

// ── Membership ───────────────────────────────────────────────────────────

servers.post('/:slug/join', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));

	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug }, include: { roles: { where: { isDefault: true } } } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });

	const ban = await db.serverBan.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } } });
	if (ban) throw new HTTPException(403, { message: 'You are banned from this server' });

	if (me.role !== 'SUPERADMIN') {
		if (server.accessType === 'PASSWORD') {
			if (!password) throw new HTTPException(403, { message: 'Password required' });
			if (!server.passwordHash) throw new HTTPException(403, { message: 'Server password not configured' });
			const valid = await verifyPassword(password, server.passwordHash);
			if (!valid) throw new HTTPException(403, { message: 'Invalid password' });
		}
		if (server.accessType === 'WHITELIST') {
			const entry = await db.serverWhitelist.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } } });
			if (!entry) throw new HTTPException(403, { message: 'Not on whitelist' });
		}
	}

	const defaultRole = server.roles[0];
	await db.serverMember.upsert({
		where: { userId_serverId: { userId: me.id, serverId: server.id } },
		create: { userId: me.id, serverId: server.id, roleId: defaultRole?.id },
		update: {},
	});
	return c.json(await getServer(db, slug));
});

servers.post('/:slug/leave', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	if (server.ownerId === me.id) throw new HTTPException(403, { message: 'Owner cannot leave — transfer ownership or delete the server' });
	await db.serverMember.deleteMany({ where: { userId: me.id, serverId: server.id } });
	return c.json({ ok: true });
});

servers.get('/:slug/members', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const isMember = (await db.serverMember.count({ where: { server: { slug }, userId: me.id } })) > 0;
	if (!isMember) throw new HTTPException(403, { message: 'Not a member' });
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const members = await db.serverMember.findMany({
		where: { serverId: server.id },
		select: {
			joinedAt: true, nickname: true,
			user: { select: { id: true, username: true, name: true, avatarUrl: true } },
			role: { select: { id: true, name: true, color: true } },
		},
		orderBy: { joinedAt: 'asc' },
	});
	return c.json(members);
});

servers.delete('/:slug/members/:userId', async (c) => {
	const slug = c.req.param('slug');
	const targetUserId = c.req.param('userId');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'kickMembers');
	if (server.ownerId === targetUserId) throw new HTTPException(403, { message: 'Cannot kick the server owner' });
	await db.serverMember.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
	return c.json({ ok: true });
});

servers.patch('/:slug/members/:userId/nickname', async (c) => {
	const slug = c.req.param('slug');
	const targetUserId = c.req.param('userId');
	const me = c.get('user');
	const { nickname } = await c.req.json<{ nickname?: string | null }>();
	if (nickname && nickname.trim().length > 32) throw new HTTPException(400, { message: 'Nickname max 32 characters' });

	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const isOwner = server.ownerId === me.id;
	if (!isOwner && targetUserId !== me.id) {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
		const perms = member?.role?.permissions as ServerPermissions | null;
		if (!perms?.manageNicknames) throw new HTTPException(403, { message: 'Missing permission: manageNicknames' });
	}
	const target = await db.serverMember.findUnique({ where: { userId_serverId: { userId: targetUserId, serverId: server.id } } });
	if (!target) throw new HTTPException(404, { message: 'Member not found' });
	await db.serverMember.update({ where: { userId_serverId: { userId: targetUserId, serverId: server.id } }, data: { nickname: nickname?.trim() || null } });
	return c.json({ nickname: nickname?.trim() || null });
});

servers.patch('/:slug/members/:userId/role', async (c) => {
	const slug = c.req.param('slug');
	const targetUserId = c.req.param('userId');
	const me = c.get('user');
	const { roleId } = await c.req.json<{ roleId?: string | null }>();

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageRoles');
	const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: targetUserId, serverId: server.id } } });
	if (!member) throw new HTTPException(404, { message: 'User is not a member of this server' });
	if (roleId) {
		const role = await db.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
		if (!role) throw new HTTPException(404, { message: 'Role not found in this server' });
	}
	await db.serverMember.update({ where: { userId_serverId: { userId: targetUserId, serverId: server.id } }, data: { roleId: roleId ?? null } });
	return c.json({ ok: true });
});

// ── Bans ─────────────────────────────────────────────────────────────────

servers.post('/:slug/bans', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const body = await c.req.json<{ userId: string; reason?: string }>();

	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const isOwner = server.ownerId === me.id;
	if (!isOwner) {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
		const perms = member?.role?.permissions as ServerPermissions | null;
		if (!perms?.banMembers) throw new HTTPException(403, { message: 'Missing permission: banMembers' });
	}
	if (server.ownerId === body.userId) throw new HTTPException(403, { message: 'Cannot ban the server owner' });

	await db.serverMember.deleteMany({ where: { userId: body.userId, serverId: server.id } });
	await db.serverBan.upsert({
		where: { userId_serverId: { userId: body.userId, serverId: server.id } },
		create: { userId: body.userId, serverId: server.id, bannedById: me.id, reason: body.reason },
		update: { reason: body.reason, bannedById: me.id },
	});
	return c.json({ ok: true });
});

servers.delete('/:slug/bans/:userId', async (c) => {
	const slug = c.req.param('slug');
	const targetUserId = c.req.param('userId');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const isOwner = server.ownerId === me.id;
	if (!isOwner) {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
		const perms = member?.role?.permissions as ServerPermissions | null;
		if (!perms?.banMembers) throw new HTTPException(403, { message: 'Missing permission: banMembers' });
	}
	await db.serverBan.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
	return c.json({ ok: true });
});

servers.get('/:slug/bans', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const isOwner = server.ownerId === me.id;
	if (!isOwner) {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
		const perms = member?.role?.permissions as ServerPermissions | null;
		if (!perms?.banMembers && !perms?.kickMembers) throw new HTTPException(403, { message: 'Insufficient permissions' });
	}
	const bans = await db.serverBan.findMany({
		where: { serverId: server.id },
		include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
	});
	return c.json(bans);
});

// ── Channels ─────────────────────────────────────────────────────────────

servers.post('/:slug/channels', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const dto = await c.req.json<{ name?: string; type?: 'TEXT' | 'VOICE'; position?: number }>();
	if (!dto.name?.trim()) throw new HTTPException(400, { message: 'Channel name is required' });
	if (dto.name.length > 64) throw new HTTPException(400, { message: 'Channel name max 64 characters' });

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageChannels');
	const channel = await db.channel.create({
		data: { name: dto.name, type: dto.type ?? 'TEXT', position: dto.position ?? 0, serverId: server.id },
		select: { id: true, name: true, type: true, position: true },
	});
	return c.json(channel);
});

servers.patch('/:slug/channels/:channelId', async (c) => {
	const slug = c.req.param('slug');
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const dto = await c.req.json<{ name?: string; position?: number }>();

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageChannels');
	const channel = await db.channel.findFirst({ where: { id: channelId, serverId: server.id } });
	if (!channel) throw new HTTPException(404, { message: 'Channel not found' });
	const updated = await db.channel.update({
		where: { id: channelId },
		data: { name: dto.name ?? undefined, position: dto.position ?? undefined },
		select: { id: true, name: true, type: true, position: true },
	});
	return c.json(updated);
});

servers.delete('/:slug/channels/:channelId', async (c) => {
	const slug = c.req.param('slug');
	const channelId = c.req.param('channelId');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageChannels');
	const channel = await db.channel.findFirst({ where: { id: channelId, serverId: server.id } });
	if (!channel) throw new HTTPException(404, { message: 'Channel not found' });

	const attachments = await db.attachment.findMany({ where: { message: { channelId } }, select: { url: true } });
	await db.channel.delete({ where: { id: channelId } });
	if (attachments.length) await deleteManyByUrls(c.env, attachments.map((a) => a.url));
	return c.json({ ok: true });
});

// ── Whitelist ────────────────────────────────────────────────────────────

servers.get('/:slug/whitelist', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	await assertPermission(db, slug, me.id, me.role, 'manageServer');
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const list = await db.serverWhitelist.findMany({ where: { serverId: server.id }, select: { user: { select: { id: true, username: true, avatarUrl: true } } } });
	return c.json(list);
});

servers.post('/:slug/whitelist', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const { username } = await c.req.json<{ username?: string }>();
	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageServer');
	const target = await db.user.findUnique({ where: { username } });
	if (!target) throw new HTTPException(404, { message: 'User not found' });
	await db.serverWhitelist.upsert({
		where: { userId_serverId: { userId: target.id, serverId: server.id } },
		create: { userId: target.id, serverId: server.id },
		update: {},
	});
	return c.json({ ok: true });
});

servers.delete('/:slug/whitelist/:userId', async (c) => {
	const slug = c.req.param('slug');
	const targetUserId = c.req.param('userId');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageServer');
	await db.serverWhitelist.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
	return c.json({ ok: true });
});

// ── Roles ────────────────────────────────────────────────────────────────

servers.get('/:slug/roles', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const db = createDb(c.env);
	const isMember = (await db.serverMember.count({ where: { server: { slug }, userId: me.id } })) > 0;
	if (!isMember) throw new HTTPException(403, { message: 'Not a member' });
	const server = await db.server.findUnique({ where: { slug } });
	if (!server) throw new HTTPException(404, { message: 'Server not found' });
	const roles = await db.serverRole.findMany({ where: { serverId: server.id }, orderBy: { position: 'desc' } });
	return c.json(roles);
});

servers.post('/:slug/roles', async (c) => {
	const slug = c.req.param('slug');
	const me = c.get('user');
	const dto = await c.req.json<{ name?: string; color?: string; permissions?: Partial<ServerPermissions> }>();
	if (!dto.name?.trim()) throw new HTTPException(400, { message: 'Role name is required' });
	if (dto.name.length > 50) throw new HTTPException(400, { message: 'Role name max 50 characters' });

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageRoles');
	const isOwner = server.ownerId === me.id;

	const perms: ServerPermissions = { ...DEFAULT_PERMISSIONS, ...dto.permissions };
	if (!isOwner && me.role !== 'SUPERADMIN') {
		const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
		const myPerms = (member?.role?.permissions as ServerPermissions | null) ?? DEFAULT_PERMISSIONS;
		for (const key of Object.keys(perms) as (keyof ServerPermissions)[]) {
			if (!myPerms[key]) perms[key] = false;
		}
	}

	const role = await db.serverRole.create({ data: { name: dto.name, color: dto.color, permissions: perms as object, serverId: server.id } });
	return c.json(role);
});

servers.patch('/:slug/roles/:roleId', async (c) => {
	const slug = c.req.param('slug');
	const roleId = c.req.param('roleId');
	const me = c.get('user');
	const dto = await c.req.json<{ name?: string; color?: string; permissions?: Partial<ServerPermissions> }>();

	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageRoles');
	const role = await db.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
	if (!role) throw new HTTPException(404, { message: 'Role not found' });
	if (role.isDefault) throw new HTTPException(403, { message: 'Cannot edit the @everyone role' });

	const isOwner = server.ownerId === me.id;
	let perms: Record<string, boolean> | undefined;
	if (dto.permissions) {
		const merged: Record<string, boolean> = { ...(role.permissions as Record<string, boolean>), ...dto.permissions };
		if (!isOwner && me.role !== 'SUPERADMIN') {
			const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId: me.id, serverId: server.id } }, include: { role: true } });
			const myPerms = (member?.role?.permissions as ServerPermissions | null) ?? DEFAULT_PERMISSIONS;
			for (const key of Object.keys(merged) as (keyof ServerPermissions)[]) {
				if (!myPerms[key]) merged[key] = false;
			}
		}
		perms = merged;
	}

	const updated = await db.serverRole.update({
		where: { id: roleId },
		data: { name: dto.name ?? undefined, color: dto.color ?? undefined, permissions: perms ?? undefined },
	});
	return c.json(updated);
});

servers.delete('/:slug/roles/:roleId', async (c) => {
	const slug = c.req.param('slug');
	const roleId = c.req.param('roleId');
	const me = c.get('user');
	const db = createDb(c.env);
	const server = await assertPermission(db, slug, me.id, me.role, 'manageRoles');
	const role = await db.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
	if (!role) throw new HTTPException(404, { message: 'Role not found' });
	if (role.isDefault) throw new HTTPException(403, { message: 'Cannot delete the @everyone role' });
	await db.serverRole.delete({ where: { id: roleId } });
	return c.json({ ok: true });
});

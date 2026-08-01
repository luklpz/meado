import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import disposableDomainsList from 'disposable-email-domains';
import type { HonoEnv } from '../hono-env.js';
import { createDb } from '../lib/db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signLoginToken, signVerifyToken, signResetToken, signSocketToken, verifyToken, type VerifyTokenPayload, type ResetTokenPayload } from '../lib/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { uploadImageToCloudinary } from '../lib/cloudinary.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const DISPOSABLE_DOMAINS = new Set(disposableDomainsList);
const USERNAME_RE = /^[a-zA-Z0-9]+$/;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const COOKIE = 'token';

function normalizeEmail(email: string): string {
	const atIndex = email.lastIndexOf('@');
	if (atIndex === -1) return email.toLowerCase();
	const local = email.slice(0, atIndex).toLowerCase().replace(/\./g, '');
	const domain = email.slice(atIndex + 1).toLowerCase();
	return `${local}@${domain}`;
}

function isProd(env: { NODE_ENV?: string }): boolean {
	return env.NODE_ENV === 'production';
}

function setSessionCookie(c: import('hono').Context<HonoEnv>, token: string) {
	setCookie(c, COOKIE, token, {
		httpOnly: true,
		secure: isProd(c.env),
		sameSite: isProd(c.env) ? 'None' : 'Lax',
		maxAge: 7 * 24 * 60 * 60, // segundos (no ms — distinto de res.cookie de Express)
		path: '/',
	});
}

export const auth = new Hono<HonoEnv>();

// Mismos límites que @Throttle() en el NestJS original — vía RateLimiterDO (ver middleware/rate-limit.ts)
auth.post('/register', rateLimit('auth:register', 5, 60 * 60_000), async (c) => {
	const dto = await c.req.json<{ username?: string; name?: string; email?: string; password?: string }>();
	if (!dto.username || !dto.email || !dto.password) {
		return c.json({ message: 'Se requiere nombre de usuario, email y contraseña' }, 400);
	}
	if (!USERNAME_RE.test(dto.username)) {
		return c.json({ message: 'El nombre de usuario solo puede contener letras y números' }, 400);
	}
	if (dto.username.length < 3 || dto.username.length > 20) {
		return c.json({ message: 'El nombre de usuario debe tener entre 3 y 20 caracteres' }, 400);
	}
	if (dto.password.length < 8) {
		return c.json({ message: 'La contraseña debe tener al menos 8 caracteres' }, 400);
	}

	const emailDomain = dto.email.slice(dto.email.lastIndexOf('@') + 1).toLowerCase();
	if (DISPOSABLE_DOMAINS.has(emailDomain)) {
		return c.json({ message: 'No se permiten direcciones de email temporales o desechables' }, 400);
	}

	const normalizedEmail = normalizeEmail(dto.email);
	const db = createDb(c.env);

	const [byUsername, byEmail] = await Promise.all([
		db.user.findUnique({ where: { username: dto.username } }),
		db.user.findUnique({ where: { email: normalizedEmail } }),
	]);
	if (byUsername) return c.json({ message: 'El nombre de usuario ya está en uso' }, 409);
	if (byEmail) return c.json({ message: 'El email ya está registrado' }, 409);

	const count = await db.user.count();
	const role = count === 0 ? 'SUPERADMIN' : 'USER';
	const passwordHash = await hashPassword(dto.password);

	let user: { id: string; username: string; email: string };
	try {
		user = await db.user.create({
			data: { username: dto.username, name: dto.name?.trim() || null, email: normalizedEmail, passwordHash, role },
			select: { id: true, username: true, email: true },
		});
	} catch (e) {
		const err = e as { code?: string; meta?: { target?: string[] } };
		if (err.code === 'P2002') {
			const field = err.meta?.target?.includes('email') ? 'email' : 'username';
			return c.json({ message: field === 'email' ? 'El email ya está registrado' : 'El nombre de usuario ya está en uso' }, 409);
		}
		throw e;
	}

	const verifyTokenStr = await signVerifyToken(c.env.JWT_SECRET, user.id, user.email);

	try {
		await sendVerificationEmail(c.env, user.email, user.username, verifyTokenStr);
	} catch {
		await db.user.delete({ where: { id: user.id } });
		return c.json({ message: 'No se pudo enviar el email de verificación. Comprueba la dirección e inténtalo de nuevo' }, 400);
	}

	return c.json({ message: 'Account created. Check your email to verify your account.' });
});

auth.get('/verify-email', async (c) => {
	const token = c.req.query('token') ?? '';
	const payload = await verifyToken<VerifyTokenPayload>(c.env.JWT_SECRET, token);

	if (!payload || payload.type !== 'verify') {
		return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid-token`);
	}

	const db = createDb(c.env);
	const user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
	if (!user) return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid-token`);

	await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
	return c.redirect(`${c.env.FRONTEND_URL}/login?verified=1`);
});

auth.post('/login', rateLimit('auth:login', 8, 60_000), async (c) => {
	const dto = await c.req.json<{ email?: string; password?: string }>();
	if (!dto.email || !dto.password) return c.json({ message: 'Credenciales incorrectas' }, 401);

	const db = createDb(c.env);
	const normalizedEmail = normalizeEmail(dto.email);
	const user = await db.user.findUnique({ where: { email: normalizedEmail } });
	if (!user) return c.json({ message: 'Credenciales incorrectas' }, 401);

	const valid = await verifyPassword(dto.password, user.passwordHash);
	if (!valid) return c.json({ message: 'Credenciales incorrectas' }, 401);
	if (!user.emailVerified) return c.json({ message: 'Verifica tu email antes de iniciar sesión' }, 401);

	const token = await signLoginToken(c.env.JWT_SECRET, { id: user.id, username: user.username, role: user.role });
	setSessionCookie(c, token);

	return c.json({
		id: user.id, username: user.username, name: user.name, role: user.role, avatarUrl: user.avatarUrl,
		bio: user.bio, pronouns: user.pronouns, bannerColor: user.bannerColor,
	});
});

auth.post('/forgot-password', rateLimit('auth:forgot-password', 3, 60 * 60_000), async (c) => {
	const body = await c.req.json<{ email?: string }>();
	const generic = { message: 'If that email exists, a reset link has been sent.' };
	if (!body.email) return c.json(generic);

	const db = createDb(c.env);
	const normalizedEmail = normalizeEmail(body.email);
	const user = await db.user.findUnique({ where: { email: normalizedEmail } });
	if (!user || !user.emailVerified) return c.json(generic);

	const resetTokenStr = await signResetToken(c.env.JWT_SECRET, user.id);
	try {
		await sendPasswordResetEmail(c.env, user.email, user.username, resetTokenStr);
	} catch {
		return c.json({ message: 'No se pudo enviar el email de recuperación. Inténtalo más tarde' }, 400);
	}
	return c.json(generic);
});

auth.post('/reset-password', rateLimit('auth:reset-password', 5, 60 * 60_000), async (c) => {
	const body = await c.req.json<{ token?: string; password?: string }>();
	const payload = body.token ? await verifyToken<ResetTokenPayload>(c.env.JWT_SECRET, body.token) : null;

	if (!payload || payload.type !== 'reset') {
		return c.json({ message: 'El enlace de recuperación no es válido o ha expirado' }, 400);
	}
	if (!body.password || body.password.length < 8) {
		return c.json({ message: 'La contraseña debe tener al menos 8 caracteres' }, 400);
	}

	const db = createDb(c.env);
	const user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
	if (!user) return c.json({ message: 'El enlace de recuperación no es válido o ha expirado' }, 400);

	const passwordHash = await hashPassword(body.password);
	await db.user.update({ where: { id: user.id }, data: { passwordHash } });
	return c.json({ message: 'Password updated successfully' });
});

auth.patch('/avatar', requireAuth, async (c) => {
	const body = await c.req.parseBody();
	const file = body['file'];
	if (!(file instanceof File)) return c.json({ message: 'No se recibió ningún archivo' }, 400);
	if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
		return c.json({ message: 'Tipo de archivo no permitido. Usa JPEG, PNG, GIF o WebP.' }, 400);
	}
	if (file.size > 10 * 1024 * 1024) {
		return c.json({ message: 'El archivo supera el límite de 10 MB' }, 400);
	}

	const userId = c.get('user').id;
	const avatarUrl = await uploadImageToCloudinary(c.env, file, { folder: 'meado/avatars', publicId: `avatar-${userId}` });

	const db = createDb(c.env);
	await db.user.update({ where: { id: userId }, data: { avatarUrl } });
	return c.json({ avatarUrl });
});

auth.post('/logout', (c) => {
	deleteCookie(c, COOKIE, { path: '/' });
	return c.json({ ok: true });
});

auth.get('/me', requireAuth, async (c) => {
	const user = c.get('user');
	const db = createDb(c.env);
	const dbUser = await db.user.findUnique({
		where: { id: user.id },
		select: {
			avatarUrl: true, name: true, bio: true, pronouns: true, bannerColor: true,
			allowDmsFromServerMembers: true, allowFriendRequestsFromAll: true, showActivityStatus: true,
			notifDms: true, notifMentions: true, notifSounds: true, notifEmailDigest: true,
		},
	});

	const socketToken = await signSocketToken(c.env.JWT_SECRET, {
		id: user.id, username: user.username, role: user.role, avatarUrl: dbUser?.avatarUrl ?? null,
	});

	return c.json({
		...user,
		name: dbUser?.name,
		avatarUrl: dbUser?.avatarUrl,
		bio: dbUser?.bio,
		pronouns: dbUser?.pronouns,
		bannerColor: dbUser?.bannerColor,
		allowDmsFromServerMembers: dbUser?.allowDmsFromServerMembers ?? true,
		allowFriendRequestsFromAll: dbUser?.allowFriendRequestsFromAll ?? false,
		showActivityStatus: dbUser?.showActivityStatus ?? true,
		notifDms: dbUser?.notifDms ?? true,
		notifMentions: dbUser?.notifMentions ?? true,
		notifSounds: dbUser?.notifSounds ?? true,
		notifEmailDigest: dbUser?.notifEmailDigest ?? false,
		socketToken,
	});
});

auth.patch('/profile', requireAuth, async (c) => {
	const dto = await c.req.json<{ name?: string; bio?: string; pronouns?: string; bannerColor?: string }>();
	const data: Record<string, string | null> = {};
	if ('name' in dto) data.name = dto.name?.trim() || null;
	if ('bio' in dto) data.bio = dto.bio?.trim() || null;
	if ('pronouns' in dto) data.pronouns = dto.pronouns?.trim() || null;
	if ('bannerColor' in dto) {
		if (dto.bannerColor && !/^#[0-9a-fA-F]{6}$/.test(dto.bannerColor)) {
			return c.json({ message: 'bannerColor must be a valid hex color (e.g. #5865f2)' }, 400);
		}
		data.bannerColor = dto.bannerColor || null;
	}
	const db = createDb(c.env);
	const updated = await db.user.update({
		where: { id: c.get('user').id }, data,
		select: { name: true, bio: true, pronouns: true, bannerColor: true },
	});
	return c.json(updated);
});

auth.get('/privacy', requireAuth, async (c) => {
	const db = createDb(c.env);
	const user = await db.user.findUnique({
		where: { id: c.get('user').id },
		select: { allowDmsFromServerMembers: true, allowFriendRequestsFromAll: true, showActivityStatus: true },
	});
	return c.json({
		allowDmsFromServerMembers: user?.allowDmsFromServerMembers ?? true,
		allowFriendRequestsFromAll: user?.allowFriendRequestsFromAll ?? false,
		showActivityStatus: user?.showActivityStatus ?? true,
	});
});

auth.patch('/privacy', requireAuth, async (c) => {
	const dto = await c.req.json<{ allowDmsFromServerMembers?: boolean; allowFriendRequestsFromAll?: boolean; showActivityStatus?: boolean }>();
	const data: Record<string, boolean> = {};
	if (typeof dto.allowDmsFromServerMembers === 'boolean') data.allowDmsFromServerMembers = dto.allowDmsFromServerMembers;
	if (typeof dto.allowFriendRequestsFromAll === 'boolean') data.allowFriendRequestsFromAll = dto.allowFriendRequestsFromAll;
	if (typeof dto.showActivityStatus === 'boolean') data.showActivityStatus = dto.showActivityStatus;
	const db = createDb(c.env);
	const updated = await db.user.update({
		where: { id: c.get('user').id }, data,
		select: { allowDmsFromServerMembers: true, allowFriendRequestsFromAll: true, showActivityStatus: true },
	});
	return c.json(updated);
});

auth.get('/notifications', requireAuth, async (c) => {
	const db = createDb(c.env);
	const user = await db.user.findUnique({
		where: { id: c.get('user').id },
		select: { notifDms: true, notifMentions: true, notifSounds: true, notifEmailDigest: true },
	});
	return c.json({
		notifDms: user?.notifDms ?? true,
		notifMentions: user?.notifMentions ?? true,
		notifSounds: user?.notifSounds ?? true,
		notifEmailDigest: user?.notifEmailDigest ?? false,
	});
});

auth.patch('/notifications', requireAuth, async (c) => {
	const dto = await c.req.json<{ notifDms?: boolean; notifMentions?: boolean; notifSounds?: boolean; notifEmailDigest?: boolean }>();
	const data: Record<string, boolean> = {};
	if (typeof dto.notifDms === 'boolean') data.notifDms = dto.notifDms;
	if (typeof dto.notifMentions === 'boolean') data.notifMentions = dto.notifMentions;
	if (typeof dto.notifSounds === 'boolean') data.notifSounds = dto.notifSounds;
	if (typeof dto.notifEmailDigest === 'boolean') data.notifEmailDigest = dto.notifEmailDigest;
	const db = createDb(c.env);
	const updated = await db.user.update({
		where: { id: c.get('user').id }, data,
		select: { notifDms: true, notifMentions: true, notifSounds: true, notifEmailDigest: true },
	});
	return c.json(updated);
});

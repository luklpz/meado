import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from '../env.js';
import { verifyToken, type LoginTokenPayload } from '../lib/jwt.js';

export interface JwtUser {
	id: string;
	username: string;
	role: string;
}

// Equivalente a apps/backend/src/auth/jwt-auth.guard.ts: cookie httpOnly
// "token", verificada con el mismo JWT_SECRET. req.user -> c.get('user').
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: JwtUser } }>, next: Next) {
	const token = getCookie(c, 'token');
	if (!token) return c.json({ message: 'No autenticado', error: 'Unauthorized', statusCode: 401 }, 401);

	const payload = await verifyToken<LoginTokenPayload>(c.env.JWT_SECRET, token);
	if (!payload) return c.json({ message: 'Sesión inválida o expirada', error: 'Unauthorized', statusCode: 401 }, 401);

	c.set('user', { id: payload.sub, username: payload.username, role: payload.role });
	await next();
}

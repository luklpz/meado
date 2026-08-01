import { Hono } from 'hono';
import type { HonoEnv } from '../hono-env.js';
import { verifyToken, type SocketTokenPayload } from '../lib/jwt.js';

export const ws = new Hono<HonoEnv>();

// La verificación aquí es una salida rápida (401 sin gastar un DO) — cada
// DO además reverifica el mismo token por su cuenta antes de aceptar la
// conexión, no confía ciegamente en que pasar por aquí sea suficiente.
async function peekSocketToken(env: HonoEnv['Bindings'], token: string | undefined) {
	if (!token) return null;
	const payload = await verifyToken<SocketTokenPayload>(env.JWT_SECRET, token);
	if (!payload || payload.type !== 'socket') return null;
	return payload;
}

ws.get('/channel/:channelId', async (c) => {
	const payload = await peekSocketToken(c.env, c.req.query('token'));
	if (!payload) return c.text('Unauthorized', 401);
	const id = c.env.CHANNEL_DO.idFromName(c.req.param('channelId'));
	return c.env.CHANNEL_DO.get(id).fetch(c.req.raw);
});

ws.get('/dm/:conversationId', async (c) => {
	const payload = await peekSocketToken(c.env, c.req.query('token'));
	if (!payload) return c.text('Unauthorized', 401);
	const id = c.env.DM_DO.idFromName(c.req.param('conversationId'));
	return c.env.DM_DO.get(id).fetch(c.req.raw);
});

ws.get('/session', async (c) => {
	const payload = await peekSocketToken(c.env, c.req.query('token'));
	if (!payload) return c.text('Unauthorized', 401);
	// A diferencia de channel/dm, aquí SÍ hace falta el userId verificado
	// para poder enrutar (idFromName(userId)) — un userId sin verificar en
	// la URL dejaría conectar a cualquiera a la sesión de otro usuario.
	const id = c.env.USER_REGISTRY_DO.idFromName(payload.id);
	return c.env.USER_REGISTRY_DO.get(id).fetch(c.req.raw);
});

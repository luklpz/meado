import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from './hono-env.js';
import { auth } from './routes/auth.js';
import { upload } from './routes/upload.js';
import { drive } from './routes/drive.js';
import { servers } from './routes/servers.js';
import { channels } from './routes/channels.js';
import { dm } from './routes/dm.js';
import { friends } from './routes/friends.js';
import { users } from './routes/users.js';
import { ws } from './routes/ws.js';

export { ChannelDO } from './durable-objects/channel-do.js';
export { DmDO } from './durable-objects/dm-do.js';
export { UserRegistryDO } from './durable-objects/user-registry-do.js';

const app = new Hono<HonoEnv>();

app.onError((err, c) => {
	if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
	console.error(err);
	return c.json({ message: 'Internal server error' }, 500);
});

// /ws/* excluido de CORS y de la manipulación de headers: son upgrades a
// WebSocket (Response 101 con el campo `webSocket`), no respuestas HTTP
// normales — envolverlas con estos middlewares arriesga romper el upgrade.
// El check de origen para WS no se hace vía CORS de todos modos (los
// navegadores no aplican preflight/Access-Control-* a conexiones WS).
app.use('*', async (c, next) => {
	if (c.req.path.startsWith('/ws/')) return next();
	const allowed = c.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? [];
	return cors({
		origin: allowed,
		credentials: true,
	})(c, next);
});

// Equivalente mínimo a helmet({ contentSecurityPolicy: false }) del main.ts NestJS
app.use('*', async (c, next) => {
	await next();
	if (c.req.path.startsWith('/ws/')) return;
	c.res.headers.set('X-Content-Type-Options', 'nosniff');
	c.res.headers.set('X-Frame-Options', 'DENY');
	c.res.headers.set('Referrer-Policy', 'no-referrer');
});

app.get('/', (c) => c.text('meado backend (workers)'));

app.route('/auth', auth);
app.route('/upload', upload);
app.route('/drive', drive);
app.route('/servers', servers);
app.route('/channels', channels);
app.route('/dm', dm);
app.route('/friends', friends);
app.route('/users', users);
app.route('/ws', ws);

export default app;

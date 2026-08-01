import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from './hono-env.js';
import { auth } from './routes/auth.js';
import { upload } from './routes/upload.js';
import { drive } from './routes/drive.js';
import { servers } from './routes/servers.js';

const app = new Hono<HonoEnv>();

app.onError((err, c) => {
	if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
	console.error(err);
	return c.json({ message: 'Internal server error' }, 500);
});

app.use('*', async (c, next) => {
	const allowed = c.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? [];
	return cors({
		origin: allowed,
		credentials: true,
	})(c, next);
});

// Equivalente mínimo a helmet({ contentSecurityPolicy: false }) del main.ts NestJS
app.use('*', async (c, next) => {
	await next();
	c.res.headers.set('X-Content-Type-Options', 'nosniff');
	c.res.headers.set('X-Frame-Options', 'DENY');
	c.res.headers.set('Referrer-Policy', 'no-referrer');
});

app.get('/', (c) => c.text('meado backend (workers)'));

app.route('/auth', auth);
app.route('/upload', upload);
app.route('/drive', drive);
app.route('/servers', servers);

export default app;

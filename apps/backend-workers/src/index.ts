import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HonoEnv } from './hono-env.js';
import { auth } from './routes/auth.js';

const app = new Hono<HonoEnv>();

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

export default app;

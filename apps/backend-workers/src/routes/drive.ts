import { Hono } from 'hono';
import type { HonoEnv } from '../hono-env.js';
import { requireAuth } from '../middleware/auth.js';
import { initUploadSession, setPublic } from '../lib/drive.js';

export const drive = new Hono<HonoEnv>();

drive.use('*', requireAuth);

drive.post('/init-upload', async (c) => {
	const body = await c.req.json<{ filename?: string; mimeType?: string }>();
	if (!body.filename || !body.mimeType) return c.json({ message: 'filename and mimeType required' }, 400);
	if (body.filename.length > 255) return c.json({ message: 'Filename too long' }, 400);

	const safeFilename = `${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
	const result = await initUploadSession(c.env, safeFilename, body.mimeType);
	return c.json(result);
});

drive.post('/confirm', async (c) => {
	const body = await c.req.json<{ fileId?: string; nonce?: string }>();
	if (!body.fileId || !body.nonce) return c.json({ message: 'fileId and nonce required' }, 400);

	try {
		const url = await setPublic(c.env, body.fileId, body.nonce);
		return c.json({ url });
	} catch (e) {
		return c.json({ message: (e as Error).message }, 403);
	}
});

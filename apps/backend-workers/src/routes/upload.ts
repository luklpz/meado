import { Hono } from 'hono';
import type { HonoEnv } from '../hono-env.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAnyToCloudinary } from '../lib/cloudinary.js';

// SVG excluido — riesgo XSS al renderizarse inline
const BLOCKED_MIME_TYPES = new Set(['image/svg+xml', 'image/svg']);
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export const upload = new Hono<HonoEnv>();

upload.use('*', requireAuth);

upload.get('/ping', async (c) => {
	return c.json({
		ok: true,
		cloudName: c.env.CLOUDINARY_CLOUD_NAME,
		apiKeyPrefix: c.env.CLOUDINARY_API_KEY?.slice(0, 4),
		hasSecret: !!c.env.CLOUDINARY_API_SECRET,
	});
});

upload.post('/', async (c) => {
	const body = await c.req.parseBody();
	const file = body['file'];
	if (!(file instanceof File)) return c.json({ message: 'No se recibió ningún archivo' }, 400);
	if (BLOCKED_MIME_TYPES.has(file.type)) return c.json({ message: 'Tipo de archivo no permitido (SVG).' }, 400);
	if (file.size > MAX_SIZE) return c.json({ message: 'El archivo supera el límite de 25 MB' }, 400);

	const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const publicId = `${Date.now()}-${safeFilename}`;

	const url = await uploadAnyToCloudinary(c.env, file, { folder: 'meado/attachments', publicId });
	return c.json({ url, name: file.name, size: file.size, mimeType: file.type });
});

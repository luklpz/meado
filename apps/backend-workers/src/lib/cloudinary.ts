import type { Env } from '../env.js';

// El SDK de cloudinary (npm) usa upload_stream, basado en streams/http de
// Node — no es seguro asumir que corre bajo Workers aunque nodejs_compat
// esté activo. Se sube directo contra la API REST firmada de Cloudinary
// vía fetch + SHA-1 (WebCrypto), sin el SDK.
async function sha1Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function signedUpload(
	env: Env,
	file: Blob,
	opts: { folder: string; publicId?: string; resourceType: 'image' | 'auto' },
): Promise<string> {
	const timestamp = Math.floor(Date.now() / 1000);
	const params: Record<string, string> = { folder: opts.folder, timestamp: String(timestamp) };
	if (opts.publicId) {
		params.public_id = opts.publicId;
		params.overwrite = 'true';
	}

	// Firma Cloudinary: sha1(params ordenados alfabéticamente "k=v&k=v" + api_secret), sin URL-encodear
	const toSign = Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join('&');
	const signature = await sha1Hex(toSign + env.CLOUDINARY_API_SECRET);

	const form = new FormData();
	form.set('file', file);
	form.set('api_key', env.CLOUDINARY_API_KEY);
	form.set('signature', signature);
	for (const [k, v] of Object.entries(params)) form.set(k, v);

	const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${opts.resourceType === 'auto' ? 'auto' : 'image'}/upload`, {
		method: 'POST',
		body: form,
	});
	if (!res.ok) {
		throw new Error(`Cloudinary upload failed (${res.status}): ${await res.text()}`);
	}
	const data = (await res.json()) as { secure_url: string };
	return data.secure_url;
}

export function uploadImageToCloudinary(env: Env, file: Blob, opts: { folder: string; publicId?: string }): Promise<string> {
	return signedUpload(env, file, { ...opts, resourceType: 'image' });
}

// resourceType 'auto' = Cloudinary detecta imagen/vídeo/raw según el archivo (usado en /upload genérico)
export function uploadAnyToCloudinary(env: Env, file: Blob, opts: { folder: string; publicId?: string }): Promise<string> {
	return signedUpload(env, file, { ...opts, resourceType: 'auto' });
}

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';

function parseCdnUrl(url: string): { publicId: string; resourceType: 'image' | 'raw' | 'video' } | null {
	if (!url.startsWith(CLOUDINARY_PREFIX)) return null;
	const match = url.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/);
	if (!match) return null;
	const resourceType = match[1] as 'image' | 'raw' | 'video';
	let publicId = match[2];
	if (resourceType !== 'raw') publicId = publicId.replace(/\.[^./]+$/, '');
	return { publicId, resourceType };
}

export async function deleteCloudinaryByUrl(env: Env, url: string): Promise<void> {
	const parsed = parseCdnUrl(url);
	if (!parsed) return;
	try {
		const timestamp = Math.floor(Date.now() / 1000);
		const toSign = `public_id=${parsed.publicId}&timestamp=${timestamp}`;
		const signature = await sha1Hex(toSign + env.CLOUDINARY_API_SECRET);
		const form = new FormData();
		form.set('public_id', parsed.publicId);
		form.set('timestamp', String(timestamp));
		form.set('api_key', env.CLOUDINARY_API_KEY);
		form.set('signature', signature);
		await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${parsed.resourceType}/destroy`, {
			method: 'POST',
			body: form,
		});
	} catch {
		// borrado best-effort, igual que el original (solo warn, no lanza)
	}
}

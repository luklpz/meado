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

export async function uploadImageToCloudinary(
	env: Env,
	file: Blob,
	opts: { folder: string; publicId?: string },
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

	const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
		method: 'POST',
		body: form,
	});
	if (!res.ok) {
		throw new Error(`Cloudinary upload failed (${res.status}): ${await res.text()}`);
	}
	const data = (await res.json()) as { secure_url: string };
	return data.secure_url;
}

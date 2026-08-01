import type { Env } from '../env.js';

// El SDK googleapis es pesado y orientado a Node — se reemplaza por el
// flujo OAuth2 "refresh token" plano vía fetch (la app ya tiene un
// refresh_token de larga duración, no hace falta JWT de service account).
export async function getGoogleAccessToken(env: Env): Promise<string> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			refresh_token: env.GOOGLE_REFRESH_TOKEN,
			grant_type: 'refresh_token',
		}),
	});
	if (!res.ok) throw new Error(`Google OAuth2 token refresh failed (${res.status}): ${await res.text()}`);
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

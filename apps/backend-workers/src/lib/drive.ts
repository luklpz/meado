import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../env.js';
import { getGoogleAccessToken } from './google-auth.js';

// El DriveService original guarda los nonces de init-upload en un Set en
// memoria (proceso único en Render). En Workers no hay proceso único — un
// isolate distinto puede atender init-upload y confirm. Se sustituye por un
// nonce firmado (jose, 2h), verificado por firma en vez de por lookup en un
// Set. Pierde la garantía de "uso único" (un nonce robado es reproducible
// dentro de la ventana de 2h) pero mantiene la garantía real que importaba:
// que el nonce fue emitido legítimamente por init-upload — el diseño original
// tampoco ataba el nonce a un fileId concreto, así que la propiedad de
// seguridad efectiva no cambia mucho. Aceptado como trade-off razonable a
// esta escala; si hiciera falta uso único real, movería esto a un Durable
// Object o KV en la fase 3.
function secretKey(env: Env): Uint8Array {
	return new TextEncoder().encode(env.JWT_SECRET);
}

async function signNonce(env: Env): Promise<string> {
	return new SignJWT({ type: 'drive-nonce' })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('2h')
		.sign(secretKey(env));
}

async function verifyNonce(env: Env, nonce: string): Promise<boolean> {
	try {
		const { payload } = await jwtVerify(nonce, secretKey(env));
		return payload.type === 'drive-nonce';
	} catch {
		return false;
	}
}

export async function initUploadSession(env: Env, filename: string, mimeType: string): Promise<{ uploadUrl: string; nonce: string }> {
	const token = await getGoogleAccessToken(env);
	const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'X-Upload-Content-Type': mimeType,
		},
		body: JSON.stringify({ name: filename, ...(env.GOOGLE_DRIVE_FOLDER_ID ? { parents: [env.GOOGLE_DRIVE_FOLDER_ID] } : {}) }),
	});
	if (!res.ok) throw new Error('No se pudo iniciar la subida a Drive. Comprueba las credenciales de Google.');
	const uploadUrl = res.headers.get('location');
	if (!uploadUrl) throw new Error('Drive no devolvió una URL de subida válida.');

	const nonce = await signNonce(env);
	return { uploadUrl, nonce };
}

export async function setPublic(env: Env, fileId: string, nonce: string): Promise<string> {
	const valid = await verifyNonce(env, nonce);
	if (!valid) throw new Error('Invalid or expired upload nonce');

	const token = await getGoogleAccessToken(env);
	const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ role: 'reader', type: 'anyone' }),
	});
	if (!res.ok) throw new Error(`No se pudo hacer público el archivo de Drive: ${await res.text()}`);
	return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export async function deleteDriveFileByUrl(env: Env, url: string): Promise<void> {
	try {
		const fileId = new URL(url).searchParams.get('id');
		if (!fileId) return;
		const token = await getGoogleAccessToken(env);
		await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch {
		// borrado best-effort, igual que el original (solo warn, no lanza)
	}
}

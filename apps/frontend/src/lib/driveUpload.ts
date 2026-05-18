import { uploadStore } from './uploadStore.svelte.js';

export async function uploadToDrive(file: File): Promise<{ id: string; url: string }> {
	const uploadId = crypto.randomUUID();
	uploadStore.add(uploadId, file.name);

	const mimeType = file.type || 'application/octet-stream';
	let speedBytes = 0;
	let speedTime = Date.now();

	function tickSpeed(totalLoaded: number) {
		const now = Date.now();
		const elapsed = (now - speedTime) / 1000;
		if (elapsed >= 0.5) {
			uploadStore.update(uploadId, { speed: Math.max(0, (totalLoaded - speedBytes) / elapsed) });
			speedBytes = totalLoaded;
			speedTime = now;
		}
	}

	try {
		const initRes = await fetch('/api/drive/init-upload', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ filename: file.name, mimeType }),
		});
		if (!initRes.ok) throw new Error('No se pudo iniciar la subida');
		const { uploadUrl, nonce } = await initRes.json();

		const MAX_RETRIES = 6;
		let offset = 0;
		let backoff = 1000;
		let driveFile: { id: string } | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			if (attempt > 0) {
				uploadStore.update(uploadId, { resuming: true });
				await new Promise(r => setTimeout(r, backoff));
				backoff = Math.min(backoff * 2, 32000);
				try {
					const qr = await new Promise<{ offset: number; file?: { id: string } }>((res, rej) => {
						const q = new XMLHttpRequest();
						q.open('PUT', uploadUrl);
						q.setRequestHeader('Content-Range', `bytes */${file.size}`);
						q.onload = () => {
							if (q.status === 308) {
								const range = q.getResponseHeader('Range');
								const parts = range ? range.split('-') : [];
								const last = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
								res({ offset: Number.isFinite(last) ? last + 1 : 0 });
							} else if (q.status >= 200 && q.status < 300) {
								try { res({ offset: file.size, file: JSON.parse(q.responseText) }); }
								catch { res({ offset: file.size }); }
							} else {
								rej(new Error(`Resume query ${q.status}`));
							}
						};
						q.onerror = () => rej(new Error('network'));
						q.send();
					});
					if (qr.file) { driveFile = qr.file; break; }
					offset = qr.offset;
				} catch { /* keep offset */ }
			}

			if (offset >= file.size) throw new Error('Upload complete but file ID unavailable');

			const slice = file.slice(offset);
			const result = await new Promise<{ id: string } | null>((res, rej) => {
				const xhr = new XMLHttpRequest();
				xhr.open('PUT', uploadUrl);
				xhr.setRequestHeader('Content-Type', mimeType);
				xhr.setRequestHeader('Content-Range', `bytes ${offset}-${file.size - 1}/${file.size}`);
				xhr.upload.onprogress = (e) => {
					if (e.lengthComputable) {
						const total = offset + e.loaded;
						uploadStore.update(uploadId, { progress: Math.round((total / file.size) * 100), resuming: false });
						tickSpeed(total);
					}
				};
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) res(JSON.parse(xhr.responseText));
					else if (xhr.status === 308) res(null);
					else rej(new Error(`Upload failed: ${xhr.status}`));
				};
				xhr.onerror = () => rej(new Error('network'));
				xhr.send(slice);
			});

			if (result) { driveFile = result; break; }
		}

		if (!driveFile) throw new Error('Max retries exceeded');

		// Make file publicly accessible via server-issued nonce
		const confirmRes = await fetch('/api/drive/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ fileId: driveFile.id, nonce }),
		});
		if (!confirmRes.ok) throw new Error('No se pudo publicar el archivo en Drive');
		const { url } = await confirmRes.json();

		uploadStore.update(uploadId, { progress: 100, speed: 0, resuming: false, done: true });
		setTimeout(() => uploadStore.remove(uploadId), 3000);
		return { id: driveFile.id, url };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : 'Error al subir';
		uploadStore.update(uploadId, { error: msg, done: true });
		throw e;
	}
}

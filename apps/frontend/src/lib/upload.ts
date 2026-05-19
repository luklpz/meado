import { uploadStore } from './uploadStore.svelte.js';

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

const MAX_CLOUDINARY = 25 * 1024 * 1024; // 25 MB

const CLOUDINARY_CODE_TYPES = new Set([
  'application/json', 'application/xml', 'application/javascript',
]);

export function goesToCloudinary(file: File): boolean {
  if (file.size > MAX_CLOUDINARY) return false;
  if (file.type.startsWith('image/')) return true;
  if (file.type === 'application/pdf') return true;
  if (file.type.startsWith('text/')) return true;
  if (CLOUDINARY_CODE_TYPES.has(file.type)) return true;
  return false;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const uploadId = crypto.randomUUID();
  uploadStore.add(uploadId, file.name);

  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message ?? 'Upload failed');
    }

    const result: UploadResult = await res.json();
    uploadStore.update(uploadId, { progress: 100, speed: 0, done: true });
    setTimeout(() => uploadStore.remove(uploadId), 3000);
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al subir';
    uploadStore.update(uploadId, { error: msg, done: true });
    throw e;
  }
}

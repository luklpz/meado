import type { Env } from '../env.js';
import { deleteCloudinaryByUrl } from './cloudinary.js';
import { deleteDriveFileByUrl } from './drive.js';

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';

export async function deleteByUrl(env: Env, url: string): Promise<void> {
	if (url.startsWith(CLOUDINARY_PREFIX)) return deleteCloudinaryByUrl(env, url);
	if (url.startsWith(DRIVE_PREFIX)) return deleteDriveFileByUrl(env, url);
}

export async function deleteManyByUrls(env: Env, urls: string[]): Promise<void> {
	await Promise.all(urls.map((u) => deleteByUrl(env, u)));
}

import { Injectable, InternalServerErrorException, ForbiddenException, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private readonly oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  // nonces issued by initUploadSession, consumed once by setPublic
  private readonly pendingNonces = new Set<string>();

  constructor() {
    this.oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }

  async initUploadSession(filename: string, mimeType: string): Promise<{ uploadUrl: string; nonce: string }> {
    const { token } = await this.oauthClient.getAccessToken();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
        },
        body: JSON.stringify({
          name: filename,
          ...(folderId ? { parents: [folderId] } : {}),
        }),
      },
    );

    if (!res.ok) throw new InternalServerErrorException('No se pudo iniciar la subida a Drive. Comprueba las credenciales de Google.');
    const uploadUrl = res.headers.get('location');
    if (!uploadUrl) throw new InternalServerErrorException('Drive no devolvió una URL de subida válida.');

    const nonce = crypto.randomUUID();
    this.pendingNonces.add(nonce);
    // Auto-expire nonce after 2 hours (generous for large uploads)
    setTimeout(() => this.pendingNonces.delete(nonce), 2 * 60 * 60 * 1000);

    return { uploadUrl, nonce };
  }

  async setPublic(fileId: string, nonce: string): Promise<string> {
    if (!this.pendingNonces.has(nonce)) throw new ForbiddenException('Invalid or expired upload nonce');
    this.pendingNonces.delete(nonce);

    const drive = google.drive({ version: 'v3', auth: this.oauthClient });
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  async uploadBuffer(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const { token } = await this.oauthClient.getAccessToken();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const metadata = JSON.stringify({
      name: safeFilename,
      ...(folderId ? { parents: [folderId] } : {}),
    });
    const boundary = 'meado_boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) throw new InternalServerErrorException('Error al subir el archivo a Drive.');
    const { id: fileId } = await res.json() as { id: string };

    const drive = google.drive({ version: 'v3', auth: this.oauthClient });
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  async deleteByUrl(url: string): Promise<void> {
    try {
      const fileId = new URL(url).searchParams.get('id');
      if (!fileId) return;
      const drive = google.drive({ version: 'v3', auth: this.oauthClient });
      await drive.files.delete({ fileId });
    } catch (e) {
      this.logger.warn(`Failed to delete Drive file from ${url}: ${(e as Error).message}`);
    }
  }
}

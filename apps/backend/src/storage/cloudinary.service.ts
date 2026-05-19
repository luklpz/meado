import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';

function parseCdnUrl(url: string): { publicId: string; resourceType: 'image' | 'raw' | 'video' } | null {
  if (!url.startsWith(CLOUDINARY_PREFIX)) return null;
  const match = url.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  const resourceType = match[1] as 'image' | 'raw' | 'video';
  let publicId = match[2];
  // For non-raw resources, strip file extension (Cloudinary stores publicId without extension)
  if (resourceType !== 'raw') publicId = publicId.replace(/\.[^./]+$/, '');
  return { publicId, resourceType };
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  upload(buffer: Buffer, options: { folder: string; publicId?: string; resourceType?: 'image' | 'video' | 'raw' | 'auto' }): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          public_id: options.publicId,
          overwrite: !!options.publicId,
          resource_type: options.resourceType ?? 'image',
        },
        (error, result) => {
          if (error || !result) {
            reject(new InternalServerErrorException('Cloudinary upload failed'));
          } else {
            resolve(result.secure_url);
          }
        },
      );
      stream.on('error', () => reject(new InternalServerErrorException('Cloudinary upload failed')));
      stream.end(buffer);
    });
  }

  uploadBuffer(buffer: Buffer, folder: string, publicId: string): Promise<string> {
    return this.upload(buffer, { folder, publicId, resourceType: 'image' });
  }

  async deleteByUrl(url: string): Promise<void> {
    const parsed = parseCdnUrl(url);
    if (!parsed) return;
    try {
      await cloudinary.uploader.destroy(parsed.publicId, { resource_type: parsed.resourceType });
    } catch (e) {
      this.logger.warn(`Failed to delete Cloudinary asset ${parsed.publicId}: ${(e as Error).message}`);
    }
  }

  async deleteManyByUrls(urls: string[]): Promise<void> {
    await Promise.all(urls.map(u => this.deleteByUrl(u)));
  }
}

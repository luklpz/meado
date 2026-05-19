import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
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
}

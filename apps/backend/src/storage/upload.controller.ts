import {
  Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';

const ALLOWED_MIME_TYPES = new Set([
  // images (svg excluded — XSS risk when served inline)
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // pdf
  'application/pdf',
  // text / code
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/typescript',
  'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-c++', 'text/x-rust',
  'text/x-go', 'text/markdown', 'text/csv',
  'application/json', 'application/xml', 'application/javascript',
]);

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Get('ping')
  async ping() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const hasSecret = !!process.env.CLOUDINARY_API_SECRET;
    try {
      const result = await cloudinary.api.ping();
      return { ok: true, status: result.status, cloudName, apiKeyPrefix: apiKey?.slice(0, 4), hasSecret };
    } catch (e) {
      return { ok: false, error: (e as Error).message, cloudName, apiKeyPrefix: apiKey?.slice(0, 4), hasSecret };
    }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_SIZE },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Tipo de archivo no permitido (${file.mimetype}). Solo se aceptan imágenes (JPEG, PNG, GIF, WebP), PDF y archivos de texto/código.`);
    }

    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';

    const url = await this.cloudinary.upload(file.buffer, {
      folder: 'meado/attachments',
      resourceType,
    });

    return { url, name: file.originalname, size: file.size, mimeType: file.mimetype };
  }
}

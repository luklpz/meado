import {
  Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';

// SVG excluded — XSS risk when rendered inline
const BLOCKED_MIME_TYPES = new Set(['image/svg+xml', 'image/svg']);

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
    if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido (SVG).');
    }

    const url = await this.cloudinary.upload(file.buffer, {
      folder: 'meado/attachments',
      resourceType: 'auto',
    });

    return { url, name: file.originalname, size: file.size, mimeType: file.mimetype };
  }
}

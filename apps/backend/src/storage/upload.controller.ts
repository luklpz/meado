import {
  Controller, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_SIZE },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Tipo de archivo no permitido');

    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';

    const url = await this.cloudinary.upload(file.buffer, {
      folder: 'meado/attachments',
      resourceType,
    });

    return { url, name: file.originalname, size: file.size, mimeType: file.mimetype };
  }
}

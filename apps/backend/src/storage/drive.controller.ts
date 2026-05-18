import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DriveService } from './drive.service';

@UseGuards(JwtAuthGuard)
@Controller('drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post('init-upload')
  async initUpload(@Body() body: { filename: string; mimeType: string }) {
    if (!body.filename || !body.mimeType) throw new BadRequestException('filename and mimeType required');
    if (body.filename.length > 255) throw new BadRequestException('Filename too long');
    const safeFilename = `${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    return this.driveService.initUploadSession(safeFilename, body.mimeType);
  }

  @Post('confirm')
  async confirm(@Body() body: { fileId: string; nonce: string }) {
    if (!body.fileId || !body.nonce) throw new BadRequestException('fileId and nonce required');
    const url = await this.driveService.setPublic(body.fileId, body.nonce);
    return { url };
  }
}

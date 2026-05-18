import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Query,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { Inject, forwardRef } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DmService } from './dm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
};

async function uploadToSupabase(file: Express.Multer.File, path: string): Promise<string> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/attachments/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': file.mimetype,
      'x-upsert': 'true',
    },
    body: new Uint8Array(file.buffer),
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${await res.text()}`);
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/attachments/${path}`;
}

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(
    private readonly dmService: DmService,
    @Inject(forwardRef(() => MessagesGateway)) private readonly gateway: MessagesGateway,
  ) {}

  @Get()
  getConversations(@Req() req: any) {
    return this.dmService.getConversations(req.user.id);
  }

  @Get(':id/messages')
  getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.dmService.getMessages(id, req.user.id, before, isNaN(parsedLimit) ? 50 : parsedLimit);
  }

  @Post()
  getOrCreate(@Req() req: any, @Body() body: { userIds: string[]; name?: string; group?: boolean }) {
    if (body.group) {
      return this.dmService.createGroup(req.user.id, body.userIds, body.name);
    }
    return this.dmService.getOrCreate(req.user.id, body.userIds);
  }

  @Post(':id/messages')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body('content') content: string | undefined,
    @Body('attachmentUrl') attachmentUrl: string | undefined,
    @Body('attachmentName') attachmentName: string | undefined,
    @Body('attachmentSize') attachmentSize: string | undefined,
    @Body('attachmentMimeType') attachmentMimeType: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;
    if (file) {
      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const path = `dm/${id}/${Date.now()}-${req.user.id}-${Math.random().toString(36).slice(2)}.${ext}`;
      const fileUrl = await uploadToSupabase(file, path);
      attachments = [{ url: fileUrl, name: file.originalname, size: file.size, mimeType: file.mimetype }];
    } else if (attachmentUrl && attachmentName) {
      const supabase = process.env.SUPABASE_URL ?? '';
      const allowed =
        (supabase && attachmentUrl.startsWith(`${supabase}/storage/v1/object/public/`)) ||
        attachmentUrl.startsWith('https://drive.google.com/');
      if (!allowed) throw new BadRequestException('Invalid attachment URL');
      attachments = [{
        url: attachmentUrl,
        name: attachmentName,
        size: parseInt(attachmentSize ?? '0', 10),
        mimeType: attachmentMimeType ?? 'application/octet-stream',
      }];
    }
    const message = await this.dmService.sendMessage(id, req.user.id, content, attachments);
    this.gateway.broadcastDmMessageCreated(id, message);
    return message;
  }

  @Post(':id/members')
  addMember(@Req() req: any, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.dmService.addMember(id, req.user.id, body.userId);
  }

  @Patch(':id/messages/:messageId')
  async editMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body('content') content: string,
  ) {
    const message = await this.dmService.editMessage(messageId, req.user.id, content);
    this.gateway.broadcastDmMessageUpdated(id, message);
    return message;
  }

  @Delete(':id/messages/:messageId')
  async deleteMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.dmService.deleteMessage(messageId, req.user.id);
    this.gateway.broadcastDmMessageDeleted(id, messageId);
    return result;
  }
}

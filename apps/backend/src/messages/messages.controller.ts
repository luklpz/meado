import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards,
  UseInterceptors, UploadedFile,
  NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { PrismaService } from '../prisma/prisma.service';

function authUser(req: Request) {
  return (req as any).user as { id: string; username: string; role: string };
}

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
@Controller('channels')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly gateway: MessagesGateway,
    private readonly prisma: PrismaService,
  ) {}

  // ── Messages ──────────────────────────────────────────────────────────

  @Patch(':channelId/read')
  async markChannelRead(@Param('channelId') channelId: string, @Req() req: Request) {
    await this.messagesService.markChannelRead(channelId, authUser(req).id);
    return { ok: true };
  }

  @Get(':channelId/messages')
  getMessages(
    @Req() req: Request,
    @Param('channelId') channelId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.messagesService.getMessages(channelId, authUser(req).id, before, isNaN(parsedLimit) ? 50 : parsedLimit);
  }

  @Post(':channelId/messages')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — images only, large files go direct to Drive
  }))
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body('content') content: string,
    @Body('attachmentUrl') attachmentUrl: string | undefined,
    @Body('attachmentName') attachmentName: string | undefined,
    @Body('attachmentSize') attachmentSize: string | undefined,
    @Body('attachmentMimeType') attachmentMimeType: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const { id } = authUser(req);
    let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;

    if (file) {
      // Image uploaded via multipart → Supabase Storage
      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const path = `${channelId}/${Date.now()}-${id}-${Math.random().toString(36).slice(2)}.${ext}`;
      const fileUrl = await uploadToSupabase(file, path);
      attachments = [{ url: fileUrl, name: file.originalname, size: file.size, mimeType: file.mimetype }];
    } else if (attachmentUrl && attachmentName) {
      const supabase = process.env.SUPABASE_URL ?? '';
      const allowed =
        (supabase && attachmentUrl.startsWith(`${supabase}/storage/v1/object/public/`)) ||
        attachmentUrl.startsWith('https://drive.google.com/');
      if (!allowed) throw new ForbiddenException('Invalid attachment URL');
      attachments = [{
        url: attachmentUrl,
        name: attachmentName,
        size: parseInt(attachmentSize ?? '0', 10),
        mimeType: attachmentMimeType ?? 'application/octet-stream',
      }];
    }

    const message = await this.messagesService.createMessage(channelId, id, content, attachments);
    this.gateway.broadcastMessageCreated(channelId, message);
    return message;
  }

  @Patch(':channelId/messages/:messageId')
  async editMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body('content') content: string,
    @Req() req: Request,
  ) {
    const { id } = authUser(req);
    const message = await this.messagesService.editMessage(messageId, id, content);
    this.gateway.broadcastMessageUpdated(channelId, message);
    return message;
  }

  @Delete(':channelId/messages/:messageId')
  async deleteMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Req() req: Request,
  ) {
    const { id, role } = authUser(req);
    const result = await this.messagesService.deleteMessage(messageId, id, role);
    this.gateway.broadcastMessageDeleted(channelId, messageId);
    return result;
  }

  // ── Voice: LiveKit token ───────────────────────────────────────────────

  @Get(':channelId/livekit-token')
  async getLivekitToken(@Param('channelId') channelId: string, @Req() req: Request) {
    const { id, username } = authUser(req);

    const channel = await this.messagesService.getChannel(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.type !== 'VOICE') throw new ForbiddenException('Not a voice channel');

    const isMember = await this.messagesService.verifyChannelMember(channelId, id);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: id, name: username, ttl: '4h' },
    );
    token.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return { token: await token.toJwt(), url: process.env.LIVEKIT_URL };
  }
}

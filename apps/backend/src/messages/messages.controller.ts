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

  @Get(':channelId/messages')
  getMessages(
    @Req() req: Request,
    @Param('channelId') channelId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMessages(channelId, authUser(req).id, before, limit ? parseInt(limit, 10) : 50);
  }

  @Post(':channelId/messages')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body('content') content: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const { id } = authUser(req);
    let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;

    if (file) {
      const ext = file.originalname.split('.').pop();
      const path = `${channelId}/${Date.now()}-${id}.${ext}`;
      const fileUrl = await uploadToSupabase(file, path);
      attachments = [{ url: fileUrl, name: file.originalname, size: file.size, mimeType: file.mimetype }];
    }

    const message = await this.messagesService.createMessage(channelId, id, content, attachments);
    (this.gateway as any).server?.to(`channel:${channelId}`).emit('message:created', message);
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

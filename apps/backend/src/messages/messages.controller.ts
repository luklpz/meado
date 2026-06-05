import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards,
  NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { PrismaService } from '../prisma/prisma.service';

function authUser(req: Request) {
  return (req as any).user as { id: string; username: string; role: string };
}

function livekitEnv() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) throw new InternalServerErrorException('LiveKit not configured');
  return { apiKey, apiSecret, url };
}

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';

function isAllowedAttachmentUrl(url: string) {
  return url.startsWith(CLOUDINARY_PREFIX) || url.startsWith(DRIVE_PREFIX);
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
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body() body: { content?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number; attachmentMimeType?: string },
    @Req() req: Request,
  ) {
    const { id } = authUser(req);
    const { content, attachmentUrl, attachmentName, attachmentSize, attachmentMimeType } = body;
    let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;

    if (attachmentUrl && attachmentName) {
      if (!isAllowedAttachmentUrl(attachmentUrl)) throw new BadRequestException('Invalid attachment URL');
      attachments = [{
        url: attachmentUrl,
        name: attachmentName,
        size: attachmentSize ?? 0,
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
    const message = await this.messagesService.editMessage(messageId, id, content, channelId);
    this.gateway.broadcastMessageUpdated(message.channelId, message);
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
    this.gateway.broadcastMessageDeleted(result.channelId, messageId);
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

    const lk = livekitEnv();
    const token = new AccessToken(lk.apiKey, lk.apiSecret, { identity: id, name: username, ttl: '4h' });
    token.addGrant({ roomJoin: true, room: channelId, canPublish: true, canSubscribe: true, canPublishData: true });

    return { token: await token.toJwt(), url: lk.url };
  }
}

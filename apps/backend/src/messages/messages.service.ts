import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MSG_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  channelId: true,
  author: { select: { id: true, username: true, avatarUrl: true } },
  attachments: { select: { id: true, url: true, name: true, size: true, mimeType: true } },
} as const;

export interface AttachmentInput {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(channelId: string, before?: string, limit = 50) {
    const msgs = await this.prisma.message.findMany({
      where: {
        channelId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: MSG_SELECT,
    });
    return msgs.reverse();
  }

  async createMessage(channelId: string, authorId: string, content?: string, attachments?: AttachmentInput[]) {
    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      throw new BadRequestException('Message must have content or attachment');
    }
    return this.prisma.message.create({
      data: {
        channelId,
        authorId,
        content: content?.trim() || null,
        ...(attachments?.length ? { attachments: { createMany: { data: attachments } } } : {}),
      },
      select: MSG_SELECT,
    });
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorId !== userId) throw new ForbiddenException('Not your message');
    if (!content?.trim()) throw new BadRequestException('Content required');
    return this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      select: MSG_SELECT,
    });
  }

  async deleteMessage(messageId: string, userId: string, userRole: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: { include: { server: true } } },
    });
    if (!msg) throw new NotFoundException('Message not found');

    const isAuthor = msg.authorId === userId;
    const isSuperAdmin = userRole === 'SUPERADMIN';
    const isOwner = msg.channel.server.ownerId === userId;

    if (!isAuthor && !isSuperAdmin && !isOwner) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: msg.channel.server.id } },
        include: { role: true },
      });
      const perms = member?.role?.permissions as Record<string, boolean> | null;
      if (!perms?.manageMessages) throw new ForbiddenException('Cannot delete this message');
    }

    await this.prisma.message.delete({ where: { id: messageId } });
    return { ok: true, messageId, channelId: msg.channelId };
  }

  async verifyChannelMember(channelId: string, userId: string): Promise<boolean> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) return false;
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });
    return !!member;
  }

  async getChannel(channelId: string) {
    return this.prisma.channel.findUnique({ where: { id: channelId } });
  }
}

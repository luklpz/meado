import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MSG_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  channelId: true,
  author: { select: { id: true, username: true, name: true, avatarUrl: true } },
  attachments: { select: { id: true, url: true, name: true, size: true, mimeType: true } },
  reactions: { select: { userId: true, emoji: true } },
} as const;

function formatReactions(raw: { userId: string; emoji: string }[], userId: string) {
  const map = new Map<string, { count: number; me: boolean }>();
  for (const r of raw) {
    const entry = map.get(r.emoji) ?? { count: 0, me: false };
    entry.count++;
    if (r.userId === userId) entry.me = true;
    map.set(r.emoji, entry);
  }
  return Array.from(map.entries()).map(([emoji, { count, me }]) => ({ emoji, count, me }));
}

function parseCursor(cursor: string): Date {
  const d = new Date(cursor);
  if (isNaN(d.getTime())) throw new BadRequestException('Invalid cursor');
  return d;
}

export interface AttachmentInput {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getMessages(channelId: string, userId: string, before?: string, limit = 50) {
    const isMember = await this.verifyChannelMember(channelId, userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');
    const msgs = await this.prisma.message.findMany({
      where: {
        channelId,
        ...(before ? { createdAt: { lt: parseCursor(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: MSG_SELECT,
    });
    return msgs.reverse().map(m => ({ ...m, reactions: formatReactions(m.reactions, userId) }));
  }

  async createMessage(channelId: string, authorId: string, content?: string, attachments?: AttachmentInput[]) {
    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      throw new BadRequestException('Message must have content or attachment');
    }
    if (content && content.length > 4000) throw new BadRequestException('Message too long (max 4000 chars)');
    const isMember = await this.verifyChannelMember(channelId, authorId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');
    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId,
        content: content?.trim() || null,
        ...(attachments?.length ? { attachments: { createMany: { data: attachments } } } : {}),
      },
      select: MSG_SELECT,
    });
    return { ...msg, reactions: [] };
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const ALLOWED = ['👍', '❤️', '😂', '😮', '😢'];
    if (!ALLOWED.includes(emoji)) throw new BadRequestException('Invalid emoji');
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    const isMember = await this.verifyChannelMember(msg.channelId, userId);
    if (!isMember) throw new ForbiddenException('Not a member');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
      if (existing) {
        await tx.messageReaction.delete({
          where: { messageId_userId_emoji: { messageId, userId, emoji } },
        });
      } else {
        await tx.messageReaction.create({ data: { messageId, userId, emoji } });
      }
    });

    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      select: { userId: true, emoji: true },
    });
    return { messageId, channelId: msg.channelId, reactions: formatReactions(reactions, userId) };
  }

  async editMessage(messageId: string, userId: string, content: string, channelId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.channelId !== channelId) throw new ForbiddenException('Message not in this channel');
    if (msg.authorId !== userId) throw new ForbiddenException('Not your message');
    if (!(await this.verifyChannelMember(channelId, userId))) throw new ForbiddenException('Not a member');
    if (!content?.trim()) throw new BadRequestException('Content required');
    if (content.length > 4000) throw new BadRequestException('Message too long (max 4000 chars)');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      select: MSG_SELECT,
    });
    return { ...updated, reactions: formatReactions(updated.reactions, userId) };
  }

  async deleteMessage(messageId: string, userId: string, userRole: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: { include: { server: true } },
        attachments: { select: { url: true } },
      },
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

    const attachmentUrls = msg.attachments.map(a => a.url);
    await this.prisma.message.delete({ where: { id: messageId } });
    if (attachmentUrls.length) await this.storage.deleteManyByUrls(attachmentUrls);
    return { ok: true, messageId, channelId: msg.channelId };
  }

  async markChannelRead(channelId: string, userId: string): Promise<void> {
    const isMember = await this.verifyChannelMember(channelId, userId);
    if (!isMember) return;
    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId },
      update: {},
    });
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

  async verifyServerMember(serverId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    return !!member;
  }

  async getChannel(channelId: string) {
    return this.prisma.channel.findUnique({ where: { id: channelId } });
  }
}

import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DM_MSG_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  conversationId: true,
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

@Injectable()
export class DmService {
  constructor(private readonly prisma: PrismaService) {}

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const m = await this.prisma.directConversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    return !!m;
  }

  async getConversations(userId: string) {
    const convs = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, createdAt: true, author: { select: { username: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return convs.map(c => ({
      id: c.id,
      name: c.name,
      members: c.members.map(m => m.user),
      lastMessage: c.messages[0] ?? null,
    }));
  }

  async getOrCreate(requesterId: string, targetUserIds: string[]) {
    const allIds = [...new Set([requesterId, ...targetUserIds])].sort();
    if (allIds.length < 2) throw new BadRequestException('Need at least one other user');

    // For 1-on-1: find existing conversation with exactly these two members
    if (allIds.length === 2) {
      const existing = await this.prisma.directConversation.findFirst({
        where: {
          name: null,
          members: { every: { userId: { in: allIds } } },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
          },
        },
      });
      if (existing) {
        const memberCount = await this.prisma.directConversationMember.count({
          where: { conversationId: existing.id },
        });
        if (memberCount === 2) return existing;
      }
    }

    return this.prisma.directConversation.create({
      data: {
        members: { createMany: { data: allIds.map(uid => ({ userId: uid })) } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
        },
      },
    });
  }

  async createGroup(requesterId: string, userIds: string[], name?: string) {
    const allIds = [...new Set([requesterId, ...userIds])].sort();
    if (allIds.length < 2) throw new BadRequestException('Need at least one other user');
    return this.prisma.directConversation.create({
      data: {
        name: name ?? null,
        members: { createMany: { data: allIds.map(uid => ({ userId: uid })) } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
        },
      },
    });
  }

  async getMessages(conversationId: string, userId: string, before?: string, limit = 50) {
    if (!(await this.isMember(conversationId, userId))) {
      throw new ForbiddenException('Not a member');
    }
    const msgs = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: DM_MSG_SELECT,
    });
    return msgs.reverse().map(m => ({ ...m, reactions: formatReactions(m.reactions, userId) }));
  }

  async sendMessage(
    conversationId: string,
    authorId: string,
    content?: string,
    attachments?: { url: string; name: string; size: number; mimeType: string }[],
  ) {
    if (!(await this.isMember(conversationId, authorId))) {
      throw new ForbiddenException('Not a member');
    }
    if (!content?.trim() && !attachments?.length) {
      throw new BadRequestException('Content or attachment required');
    }
    if (content && content.length > 4000) throw new BadRequestException('Message too long (max 4000 chars)');
    const msg = await this.prisma.directMessage.create({
      data: {
        conversationId,
        authorId,
        content: content?.trim() || null,
        ...(attachments?.length
          ? { attachments: { create: attachments.map(a => ({ url: a.url, name: a.name, size: a.size, mimeType: a.mimeType })) } }
          : {}),
      },
      select: DM_MSG_SELECT,
    });
    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return { ...msg, reactions: [] };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorId !== userId) throw new ForbiddenException('Not your message');
    if (!content?.trim()) throw new BadRequestException('Content required');
    if (content.length > 4000) throw new BadRequestException('Message too long (max 4000 chars)');
    const updated = await this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      select: DM_MSG_SELECT,
    });
    return { ...updated, reactions: formatReactions(updated.reactions, userId) };
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorId !== userId) throw new ForbiddenException('Not your message');
    await this.prisma.directMessage.delete({ where: { id: messageId } });
    return { ok: true, messageId, conversationId: msg.conversationId };
  }

  async addMember(conversationId: string, requesterId: string, userId: string) {
    if (!(await this.isMember(conversationId, requesterId))) {
      throw new ForbiddenException('Not a member');
    }
    const conv = await this.prisma.directConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');

    const alreadyMember = await this.isMember(conversationId, userId);
    if (alreadyMember) throw new BadRequestException('Already a member');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.directConversationMember.create({ data: { conversationId, userId } });
    return user;
  }
}

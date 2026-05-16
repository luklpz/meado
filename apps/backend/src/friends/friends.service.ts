import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = { id: true, username: true, avatarUrl: true } as const;

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(senderId: string, username: string) {
    const receiver = await this.prisma.user.findUnique({ where: { username } });
    if (!receiver) throw new NotFoundException('User not found');
    if (receiver.id === senderId) throw new BadRequestException('Cannot add yourself');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId: receiver.id },
          { senderId: receiver.id, receiverId: senderId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') throw new BadRequestException('Already friends');
      if (existing.status === 'PENDING') throw new BadRequestException('Request already pending');
      throw new BadRequestException('Cannot send request');
    }

    return this.prisma.friendship.create({
      data: { senderId, receiverId: receiver.id },
      include: { receiver: { select: USER_SELECT } },
    });
  }

  async getPending(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'PENDING', OR: [{ senderId: userId }, { receiverId: userId }] },
      include: {
        sender: { select: USER_SELECT },
        receiver: { select: USER_SELECT },
      },
    });
    return rows.map(f => ({
      id: f.id,
      direction: f.senderId === userId ? 'outgoing' : 'incoming',
      user: f.senderId === userId ? f.receiver : f.sender,
      createdAt: f.createdAt,
    }));
  }

  async accept(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Request not found');
    if (friendship.receiverId !== userId) throw new ForbiddenException('Not your request');
    if (friendship.status !== 'PENDING') throw new BadRequestException('Not a pending request');

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
      include: { sender: { select: USER_SELECT } },
    });
  }

  async remove(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      throw new ForbiddenException('Not your friendship');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  async getFriends(userId: string, onlineUserIds: Set<string>) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ senderId: userId }, { receiverId: userId }] },
      include: {
        sender: { select: USER_SELECT },
        receiver: { select: USER_SELECT },
      },
    });
    return rows.map(f => {
      const friend = f.senderId === userId ? f.receiver : f.sender;
      return { id: f.id, user: { ...friend, online: onlineUserIds.has(friend.id) } };
    });
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
    });
    return rows.map(f => (f.senderId === userId ? f.receiverId : f.senderId));
  }
}

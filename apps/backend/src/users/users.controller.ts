import { Controller, Get, Post, Query, Param, Req, Body, UseGuards, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('search')
  async search(@Query('q') q: string, @Req() req: any) {
    if (!q || q.trim().length < 2) return [];
    const query = q.trim();
    const isEmail = query.includes('@');

    const users = await this.prisma.user.findMany({
      where: isEmail
        ? { email: query.toLowerCase(), emailVerified: true, id: { not: req.user.id } }
        : {
            username: { contains: query, mode: 'insensitive' },
            emailVerified: true,
            id: { not: req.user.id },
          },
      select: { id: true, username: true, name: true, avatarUrl: true },
      take: 8,
    });
    return users;
  }

  @Get(':id/profile')
  async getProfile(@Param('id') targetId: string, @Req() req: any) {
    const viewerId: string = req.user.id;

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, name: true, avatarUrl: true, bio: true, pronouns: true, bannerColor: true, createdAt: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: viewerId, receiverId: targetId },
          { senderId: targetId, receiverId: viewerId },
        ],
      },
      select: { id: true, status: true, senderId: true },
    });

    let friendshipStatus = 'none';
    if (friendship) {
      if (friendship.status === 'ACCEPTED') friendshipStatus = 'accepted';
      else if (friendship.status === 'PENDING') {
        friendshipStatus = friendship.senderId === viewerId ? 'pending_sent' : 'pending_received';
      } else if (friendship.status === 'BLOCKED') {
        friendshipStatus = friendship.senderId === viewerId ? 'blocked_by_me' : 'blocked_by_them';
      }
    }

    const isBlocked = friendshipStatus === 'blocked_by_me' || friendshipStatus === 'blocked_by_them';

    const [viewerFriendIds, targetFriendIds] = isBlocked ? [[], []] : await Promise.all([
      this.getAcceptedFriendIds(viewerId),
      this.getAcceptedFriendIds(targetId),
    ]);
    const mutualFriendIdSet = new Set(targetFriendIds);
    const mutualFriendIds = viewerFriendIds.filter(id => mutualFriendIdSet.has(id));

    const mutualFriends = mutualFriendIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: mutualFriendIds } },
          select: { id: true, username: true, name: true, avatarUrl: true },
          take: 6,
        })
      : [];

    const viewerServerIds = isBlocked ? [] : (await this.prisma.serverMember.findMany({
      where: { userId: viewerId },
      select: { serverId: true },
    })).map(m => m.serverId);

    const mutualServers = viewerServerIds.length > 0
      ? (await this.prisma.serverMember.findMany({
          where: { userId: targetId, serverId: { in: viewerServerIds } },
          include: { server: { select: { id: true, name: true, slug: true, iconUrl: true } } },
          take: 5,
        })).map(m => m.server)
      : [];

    return {
      ...target,
      friendshipStatus,
      friendshipId: friendship?.id ?? null,
      mutualFriends,
      mutualServers,
    };
  }

  @Post(':id/report')
  async reportUser(
    @Param('id') targetId: string,
    @Req() req: any,
    @Body() body: { reason: string; details?: string },
  ) {
    const reporterId: string = req.user.id;
    if (reporterId === targetId) throw new BadRequestException('Cannot report yourself');
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');

    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const recent = await this.prisma.report.findFirst({
      where: { reporterId, targetUserId: targetId },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const hoursSince = (Date.now() - recent.createdAt.getTime()) / 3600000;
      if (hoursSince < 24) throw new ConflictException('Ya has reportado a este usuario recientemente');
    }

    await this.prisma.report.create({
      data: { reporterId, targetUserId: targetId, reason: body.reason.trim(), details: body.details?.trim() || null },
    });
    return { ok: true };
  }

  private async getAcceptedFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: 'ACCEPTED',
      },
      select: { senderId: true, receiverId: true },
    });
    return friendships.map(f => (f.senderId === userId ? f.receiverId : f.senderId));
  }
}

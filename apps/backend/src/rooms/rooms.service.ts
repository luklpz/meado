import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type {
  PlayerState,
  RoomJoinPayload,
  PlayerMovePayload,
  RoomStatePayload,
} from '../shared/types/socket-events.types';

@Injectable()
export class RoomsService {
  // In-memory real-time state — Redis will replace this for Phase 2
  private readonly players = new Map<string, PlayerState>();

  constructor(private readonly prisma: PrismaService) {}

  // ── Real-time in-memory operations ──────────────────────────────────

  addPlayer(socketId: string, payload: RoomJoinPayload): PlayerState {
    const player: PlayerState = {
      playerId: socketId,
      username: payload.username,
      x: 400,
      y: 300,
      roomId: payload.roomId,
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId: string): PlayerState | undefined {
    const player = this.players.get(socketId);
    if (player) this.players.delete(socketId);
    return player;
  }

  updatePosition(socketId: string, payload: PlayerMovePayload): PlayerState | undefined {
    const player = this.players.get(socketId);
    if (!player) return undefined;
    player.x = payload.x;
    player.y = payload.y;
    return player;
  }

  getRoomState(roomId: string): RoomStatePayload {
    const players = Array.from(this.players.values()).filter((p) => p.roomId === roomId);
    return { players };
  }

  // ── Persistent DB operations ─────────────────────────────────────────

  listRooms() {
    return this.prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        accessType: true,
        maxPlayers: true,
        proximityRadius: true,
        owner: { select: { username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRoom(dto: CreateRoomDto, ownerId: string) {
    let passwordHash: string | undefined;
    if (dto.accessType === 'PASSWORD' && dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        accessType: (dto.accessType ?? 'PUBLIC') as any,
        passwordHash,
        proximityRadius: dto.proximityRadius ?? 500,
        maxPlayers: dto.maxPlayers ?? 20,
        ownerId,
      },
      select: { id: true, name: true, slug: true, accessType: true, proximityRadius: true },
    });

    // Creator becomes ADMINROOM of the room
    await this.prisma.roomMember.create({
      data: { userId: ownerId, roomId: room.id, role: 'ADMINROOM' as any },
    });

    return room;
  }

  async validateRoomAccess(slug: string, userId: string, userRole: string, password?: string) {
    const room = await this.prisma.room.findUnique({ where: { slug } });
    if (!room) throw new NotFoundException('Room not found');
    if (!room.isActive) throw new ForbiddenException('Room is not active');

    // SUPERADMIN bypasses all room access restrictions
    if (userRole !== 'SUPERADMIN') {
      if (room.accessType === 'PASSWORD') {
        if (!password) throw new ForbiddenException('Password required');
        const valid = await bcrypt.compare(password, room.passwordHash!);
        if (!valid) throw new ForbiddenException('Invalid password');
      }

      if (room.accessType === 'WHITELIST') {
        const entry = await this.prisma.roomWhitelist.findUnique({
          where: { userId_roomId: { userId, roomId: room.id } },
        });
        if (!entry) throw new ForbiddenException('Not on whitelist');
      }
    }

    // Record membership (upsert so repeated joins don't error)
    const existing = await this.prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });
    if (!existing) {
      await this.prisma.roomMember.create({
        data: { userId, roomId: room.id, role: 'USERROOM' as any },
      });
    }

    return {
      id: room.id,
      name: room.name,
      slug: room.slug,
      proximityRadius: room.proximityRadius,
      maxPlayers: room.maxPlayers,
    };
  }

  async getRoomBySlug(slug: string) {
    return this.prisma.room.findUnique({ where: { slug } });
  }

  async deleteRoom(slug: string, userId: string, userRole: string) {
    const room = await this.assertRoomAdmin(slug, userId, userRole);
    await this.prisma.room.delete({ where: { id: room.id } });
    return { ok: true };
  }

  async addToWhitelist(slug: string, username: string, requesterId: string, requesterRole: string) {
    const room = await this.assertRoomAdmin(slug, requesterId, requesterRole);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.roomWhitelist.upsert({
      where: { userId_roomId: { userId: user.id, roomId: room.id } },
      create: { userId: user.id, roomId: room.id },
      update: {},
    });
    return { ok: true };
  }

  async removeFromWhitelist(slug: string, userId: string, requesterId: string, requesterRole: string) {
    const room = await this.assertRoomAdmin(slug, requesterId, requesterRole);
    await this.prisma.roomWhitelist.deleteMany({ where: { userId, roomId: room.id } });
    return { ok: true };
  }

  async setMemberRole(
    slug: string,
    targetUserId: string,
    newRole: 'MODERATOR' | 'USERROOM',
    requesterId: string,
    requesterRole: string,
  ) {
    const room = await this.assertRoomAdmin(slug, requesterId, requesterRole);
    const member = await this.prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: targetUserId, roomId: room.id } },
    });
    if (!member) throw new NotFoundException('User is not a member of this room');
    if (member.role === 'ADMINROOM') throw new ForbiddenException('Cannot change the room admin role');

    await this.prisma.roomMember.update({
      where: { userId_roomId: { userId: targetUserId, roomId: room.id } },
      data: { role: newRole as any },
    });
    return { ok: true };
  }

  async getRoomMembers(slug: string) {
    const room = await this.prisma.room.findUnique({ where: { slug } });
    if (!room) throw new NotFoundException('Room not found');
    return this.prisma.roomMember.findMany({
      where: { roomId: room.id },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { id: true, username: true, role: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async assertRoomAdmin(slug: string, userId: string, userRole: string) {
    const room = await this.prisma.room.findUnique({ where: { slug } });
    if (!room) throw new NotFoundException('Room not found');
    if (userRole === 'SUPERADMIN') return room;

    const member = await this.prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });
    if (member?.role !== 'ADMINROOM') throw new ForbiddenException('Room admin access required');
    return room;
  }
}

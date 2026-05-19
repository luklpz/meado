import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../storage/cloudinary.service';
import type { CreateServerDto } from './dto/create-server.dto';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import { DEFAULT_PERMISSIONS, OWNER_PERMISSIONS, type ServerPermissions } from '../shared/types/permissions';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ── List ─────────────────────────────────────────────────────────────

  async listServers(userId: string) {
    const servers = await this.prisma.server.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        serverType: true,
        accessType: true,
        owner: { select: { username: true } },
        _count: { select: { members: true } },
        members: { where: { userId }, select: { userId: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    return servers.map(({ members, ...s }) => ({ ...s, isMember: members.length > 0 }));
  }

  async getServer(slug: string) {
    const server = await this.prisma.server.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        serverType: true,
        accessType: true,
        ownerId: true,
        owner: { select: { username: true, avatarUrl: true } },
        channels: {
          orderBy: { position: 'asc' },
          select: { id: true, name: true, type: true, position: true },
        },
        roles: {
          orderBy: { position: 'desc' },
          select: { id: true, name: true, color: true, position: true, isDefault: true, permissions: true },
        },
        _count: { select: { members: true } },
      },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  async isServerMember(slug: string, userId: string): Promise<boolean> {
    const count = await this.prisma.serverMember.count({
      where: { server: { slug }, userId },
    });
    return count > 0;
  }

  // ── Create ───────────────────────────────────────────────────────────

  async createServer(dto: CreateServerDto, ownerId: string) {
    if (!dto.name?.trim()) throw new BadRequestException('Server name is required');
    if (dto.name.length > 100) throw new BadRequestException('Server name max 100 characters');
    if (!dto.slug?.trim()) throw new BadRequestException('Slug is required');
    if (!/^[a-z0-9-]{2,32}$/.test(dto.slug)) throw new BadRequestException('Slug must be 2-32 lowercase alphanumeric characters or hyphens');
    if (dto.description && dto.description.length > 500) throw new BadRequestException('Description max 500 characters');
    const existing = await this.prisma.server.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Slug already in use');

    let passwordHash: string | undefined;
    if (dto.accessType === 'PASSWORD') {
      if (!dto.password) throw new BadRequestException('Password required for PASSWORD access type');
      passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        serverType: (dto.serverType ?? 'DISCORD') as any,
        accessType: (dto.accessType ?? 'PUBLIC') as any,
        passwordHash,
        ownerId,
      },
    });

    // Create default @everyone role
    await this.prisma.serverRole.create({
      data: {
        name: '@everyone',
        position: 0,
        isDefault: true,
        permissions: DEFAULT_PERMISSIONS as any,
        serverId: server.id,
      },
    });

    // Create admin role for owner
    const adminRole = await this.prisma.serverRole.create({
      data: {
        name: 'Admin',
        color: '#22c55e',
        position: 100,
        isDefault: false,
        permissions: OWNER_PERMISSIONS as any,
        serverId: server.id,
      },
    });

    // Add owner as member with admin role
    await this.prisma.serverMember.create({
      data: { userId: ownerId, serverId: server.id, roleId: adminRole.id },
    });

    // Create default channels
    await this.prisma.channel.createMany({
      data: [
        { name: 'general', type: 'TEXT', position: 0, serverId: server.id },
        { name: 'General', type: 'VOICE', position: 1, serverId: server.id },
      ],
    });

    return this.getServer(server.slug);
  }

  // ── Icon upload ───────────────────────────────────────────────────────

  async updateIcon(slug: string, file: Express.Multer.File, userId: string, userRole: string): Promise<{ iconUrl: string }> {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Tipo no permitido. Usa JPEG, PNG, GIF o WebP.');

    const server = await this.assertPermission(slug, userId, userRole, 'manageServer');

    const iconUrl = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      'meado/icons',
      `icon-${server.id}`,
    );

    await this.prisma.server.update({ where: { id: server.id }, data: { iconUrl } });
    return { iconUrl };
  }

  // ── Update / Delete ───────────────────────────────────────────────────

  async updateServer(slug: string, data: Partial<CreateServerDto>, userId: string, userRole: string) {
    const server = await this.assertPermission(slug, userId, userRole, 'manageServer');

    let passwordHash = server.passwordHash;
    if (data.accessType === 'PASSWORD' && data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    } else if (data.accessType && data.accessType !== 'PASSWORD') {
      passwordHash = null;
    }

    return this.prisma.server.update({
      where: { id: server.id },
      data: {
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        accessType: data.accessType as any ?? undefined,
        passwordHash,
      },
      select: { id: true, name: true, slug: true, description: true, accessType: true },
    });
  }

  async deleteServer(slug: string, userId: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId !== userId) throw new ForbiddenException('Only the server owner can delete the server');
    await this.prisma.server.delete({ where: { id: server.id } });
    return { ok: true };
  }

  // ── Membership ────────────────────────────────────────────────────────

  async joinServer(slug: string, userId: string, userRole: string, password?: string) {
    const server = await this.prisma.server.findUnique({
      where: { slug },
      include: { roles: { where: { isDefault: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');

    // Check if user is banned
    const ban = await this.prisma.serverBan.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
    });
    if (ban) throw new ForbiddenException('You are banned from this server');

    if (userRole !== 'SUPERADMIN') {
      if (server.accessType === 'PASSWORD') {
        if (!password) throw new ForbiddenException('Password required');
        if (!server.passwordHash) throw new ForbiddenException('Server password not configured');
        const valid = await bcrypt.compare(password, server.passwordHash);
        if (!valid) throw new ForbiddenException('Invalid password');
      }
      if (server.accessType === 'WHITELIST') {
        const entry = await this.prisma.serverWhitelist.findUnique({
          where: { userId_serverId: { userId, serverId: server.id } },
        });
        if (!entry) throw new ForbiddenException('Not on whitelist');
      }
    }

    const defaultRole = server.roles[0];
    await this.prisma.serverMember.upsert({
      where: { userId_serverId: { userId, serverId: server.id } },
      create: { userId, serverId: server.id, roleId: defaultRole?.id },
      update: {},
    });

    return this.getServer(slug);
  }

  async leaveServer(slug: string, userId: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === userId) throw new ForbiddenException('Owner cannot leave — transfer ownership or delete the server');
    await this.prisma.serverMember.deleteMany({ where: { userId, serverId: server.id } });
    return { ok: true };
  }

  async getMembers(slug: string, requesterId: string) {
    const isMember = await this.isServerMember(slug, requesterId);
    if (!isMember) throw new ForbiddenException('Not a member');
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.serverMember.findMany({
      where: { serverId: server.id },
      select: {
        joinedAt: true,
        nickname: true,
        user: { select: { id: true, username: true, name: true, avatarUrl: true } },
        role: { select: { id: true, name: true, color: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async setNickname(slug: string, userId: string, nickname: string | null) {
    if (nickname && nickname.trim().length > 32) throw new BadRequestException('Nickname max 32 characters');
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
    });
    if (!member) throw new ForbiddenException('Not a member');
    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId, serverId: server.id } },
      data: { nickname: nickname?.trim() || null },
    });
    return { nickname: nickname?.trim() || null };
  }

  async setMemberNickname(slug: string, targetUserId: string, nickname: string | null, requesterId: string) {
    if (nickname && nickname.trim().length > 32) throw new BadRequestException('Nickname max 32 characters');
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === requesterId;
    if (!isOwner) {
      if (targetUserId !== requesterId) {
        const member = await this.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: requesterId, serverId: server.id } },
          include: { role: true },
        });
        const perms = member?.role?.permissions as ServerPermissions | null;
        if (!perms?.manageNicknames) throw new ForbiddenException('Missing permission: manageNicknames');
      }
    }
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId: server.id } },
    });
    if (!target) throw new NotFoundException('Member not found');
    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId: server.id } },
      data: { nickname: nickname?.trim() || null },
    });
    return { nickname: nickname?.trim() || null };
  }

  async kickMember(slug: string, targetUserId: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'kickMembers');
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot kick the server owner');
    await this.prisma.serverMember.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    return { ok: true };
  }

  async banMember(slug: string, targetUserId: string, requesterId: string, reason?: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === requesterId;
    if (!isOwner) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId: server.id } },
        include: { role: true },
      });
      const perms = member?.role?.permissions as ServerPermissions | null;
      if (!perms?.banMembers) throw new ForbiddenException('Missing permission: banMembers');
    }
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot ban the server owner');
    // Kick first, then ban
    await this.prisma.serverMember.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    await this.prisma.serverBan.upsert({
      where: { userId_serverId: { userId: targetUserId, serverId: server.id } },
      create: { userId: targetUserId, serverId: server.id, bannedById: requesterId, reason },
      update: { reason, bannedById: requesterId },
    });
    return { ok: true };
  }

  async unbanMember(slug: string, targetUserId: string, requesterId: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === requesterId;
    if (!isOwner) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId: server.id } },
        include: { role: true },
      });
      const perms = member?.role?.permissions as ServerPermissions | null;
      if (!perms?.banMembers) throw new ForbiddenException('Missing permission: banMembers');
    }
    await this.prisma.serverBan.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    return { ok: true };
  }

  async getBans(slug: string, requesterId: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === requesterId;
    if (!isOwner) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId: server.id } },
        include: { role: true },
      });
      const perms = member?.role?.permissions as ServerPermissions | null;
      if (!perms?.banMembers && !perms?.kickMembers) throw new ForbiddenException('Insufficient permissions');
    }
    return this.prisma.serverBan.findMany({
      where: { serverId: server.id },
      include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
    });
  }

  async assignRole(slug: string, targetUserId: string, roleId: string | null, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageRoles');
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId: server.id } },
    });
    if (!member) throw new NotFoundException('User is not a member of this server');

    if (roleId) {
      const role = await this.prisma.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
      if (!role) throw new NotFoundException('Role not found in this server');
    }

    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId: server.id } },
      data: { roleId },
    });
    return { ok: true };
  }

  // ── Whitelist ─────────────────────────────────────────────────────────

  async getWhitelist(slug: string, requesterId: string, requesterRole: string) {
    await this.assertPermission(slug, requesterId, requesterRole, 'manageServer');
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.serverWhitelist.findMany({
      where: { serverId: server.id },
      select: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  async addToWhitelist(slug: string, username: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageServer');
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.serverWhitelist.upsert({
      where: { userId_serverId: { userId: user.id, serverId: server.id } },
      create: { userId: user.id, serverId: server.id },
      update: {},
    });
    return { ok: true };
  }

  async removeFromWhitelist(slug: string, targetUserId: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageServer');
    await this.prisma.serverWhitelist.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    return { ok: true };
  }

  // ── Roles ─────────────────────────────────────────────────────────────

  async getRoles(slug: string, requesterId: string) {
    const isMember = await this.isServerMember(slug, requesterId);
    if (!isMember) throw new ForbiddenException('Not a member');
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.serverRole.findMany({
      where: { serverId: server.id },
      orderBy: { position: 'desc' },
    });
  }

  async createRole(slug: string, dto: CreateRoleDto, requesterId: string, requesterRole: string) {
    if (!dto.name?.trim()) throw new BadRequestException('Role name is required');
    if (dto.name.length > 50) throw new BadRequestException('Role name max 50 characters');
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageRoles');
    const isOwner = server.ownerId === requesterId;

    let perms: ServerPermissions = { ...DEFAULT_PERMISSIONS, ...dto.permissions };
    if (!isOwner && requesterRole !== 'SUPERADMIN') {
      // Only grant permissions the requester themselves has
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId: server.id } },
        include: { role: true },
      });
      const myPerms = member?.role?.permissions as ServerPermissions | null ?? DEFAULT_PERMISSIONS;
      for (const key of Object.keys(perms) as (keyof ServerPermissions)[]) {
        if (!myPerms[key]) perms[key] = false;
      }
    }

    return this.prisma.serverRole.create({
      data: {
        name: dto.name,
        color: dto.color,
        permissions: perms as any,
        serverId: server.id,
      },
    });
  }

  async updateRole(
    slug: string,
    roleId: string,
    dto: Partial<CreateRoleDto>,
    requesterId: string,
    requesterRole: string,
  ) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageRoles');
    const role = await this.prisma.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isDefault) throw new ForbiddenException('Cannot edit the @everyone role');

    const isOwner = server.ownerId === requesterId;

    let perms: Record<string, boolean> | undefined;
    if (dto.permissions) {
      const merged: Record<string, boolean> = { ...(role.permissions as any), ...dto.permissions };
      if (!isOwner && requesterRole !== 'SUPERADMIN') {
        // Intersect with requester's own permissions
        const member = await this.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: requesterId, serverId: server.id } },
          include: { role: true },
        });
        const myPerms = member?.role?.permissions as ServerPermissions | null ?? DEFAULT_PERMISSIONS;
        for (const key of Object.keys(merged) as (keyof ServerPermissions)[]) {
          if (!myPerms[key]) merged[key] = false;
        }
      }
      perms = merged;
    }

    return this.prisma.serverRole.update({
      where: { id: roleId },
      data: {
        name: dto.name ?? undefined,
        color: dto.color ?? undefined,
        permissions: perms as any ?? undefined,
      },
    });
  }

  async deleteRole(slug: string, roleId: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageRoles');
    const role = await this.prisma.serverRole.findFirst({ where: { id: roleId, serverId: server.id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isDefault) throw new ForbiddenException('Cannot delete the @everyone role');
    await this.prisma.serverRole.delete({ where: { id: roleId } });
    return { ok: true };
  }

  // ── Channels ──────────────────────────────────────────────────────────

  async createChannel(slug: string, dto: CreateChannelDto, requesterId: string, requesterRole: string) {
    if (!dto.name?.trim()) throw new BadRequestException('Channel name is required');
    if (dto.name.length > 64) throw new BadRequestException('Channel name max 64 characters');
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageChannels');
    return this.prisma.channel.create({
      data: { name: dto.name, type: dto.type as any, position: dto.position ?? 0, serverId: server.id },
      select: { id: true, name: true, type: true, position: true },
    });
  }

  async updateChannel(slug: string, channelId: string, dto: Partial<CreateChannelDto>, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageChannels');
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId: server.id } });
    if (!channel) throw new NotFoundException('Channel not found');
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { name: dto.name ?? undefined, position: dto.position ?? undefined },
      select: { id: true, name: true, type: true, position: true },
    });
  }

  async deleteChannel(slug: string, channelId: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageChannels');
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId: server.id } });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.prisma.channel.delete({ where: { id: channelId } });
    return { ok: true };
  }

  // ── Permission helpers ────────────────────────────────────────────────

  async hasPermission(serverId: string, userId: string, userRole: string, perm: keyof ServerPermissions): Promise<boolean> {
    if (userRole === 'SUPERADMIN') return true;

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return false;
    if (server.ownerId === userId) return true;

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { role: true },
    });
    if (!member) return false;

    const perms = member.role?.permissions as ServerPermissions | null;
    return perms?.[perm] ?? false;
  }

  private async assertPermission(slug: string, userId: string, userRole: string, perm: keyof ServerPermissions) {
    const server = await this.prisma.server.findUnique({
      where: { slug },
      include: { roles: { where: { isDefault: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (userRole === 'SUPERADMIN' || server.ownerId === userId) return server;

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
      include: { role: true },
    });
    if (!member) throw new ForbiddenException('Not a member of this server');

    const perms = member.role?.permissions as ServerPermissions | null;
    if (!perms?.[perm]) throw new ForbiddenException(`Missing permission: ${perm}`);

    return server;
  }

  // ── Unread ────────────────────────────────────────────────────────────

  async getServerUnread(slug: string, userId: string): Promise<{ channelId: string; count: number }[]> {
    const server = await this.prisma.server.findUnique({ where: { slug }, select: { id: true } });
    if (!server) throw new NotFoundException('Server not found');

    const rows = await this.prisma.$queryRaw<{ channelId: string; count: bigint }[]>`
      SELECT c.id as "channelId", COUNT(m.id) as count
      FROM "Channel" c
      LEFT JOIN "ChannelRead" cr ON cr."channelId" = c.id AND cr."userId" = ${userId}
      LEFT JOIN "Message" m ON m."channelId" = c.id
        AND m."authorId" != ${userId}
        AND (cr."lastReadAt" IS NULL OR m."createdAt" > cr."lastReadAt")
      WHERE c."serverId" = ${server.id} AND c.type::text = 'TEXT'
      GROUP BY c.id
    `;
    return rows.map(r => ({ channelId: r.channelId, count: Number(r.count) }));
  }
}

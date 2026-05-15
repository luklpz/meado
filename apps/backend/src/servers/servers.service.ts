import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServerDto } from './dto/create-server.dto';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import { DEFAULT_PERMISSIONS, ADMIN_PERMISSIONS, type ServerPermissions } from '../shared/types/permissions';

@Injectable()
export class ServersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List ─────────────────────────────────────────────────────────────

  listServers() {
    return this.prisma.server.findMany({
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
      },
      orderBy: { createdAt: 'asc' },
    });
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

  // ── Create ───────────────────────────────────────────────────────────

  async createServer(dto: CreateServerDto, ownerId: string) {
    if (dto.serverType === 'SPATIAL') {
      throw new HttpException('Los servidores espaciales 2D aún no están implementados', HttpStatus.NOT_IMPLEMENTED);
    }

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
    const everyoneRole = await this.prisma.serverRole.create({
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
        permissions: ADMIN_PERMISSIONS as any,
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

  async deleteServer(slug: string, userId: string, userRole: string) {
    const server = await this.assertPermission(slug, userId, userRole, 'manageServer');
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

    if (userRole !== 'SUPERADMIN') {
      if (server.accessType === 'PASSWORD') {
        if (!password) throw new ForbiddenException('Password required');
        const valid = await bcrypt.compare(password, server.passwordHash!);
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

  async getMembers(slug: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.serverMember.findMany({
      where: { serverId: server.id },
      select: {
        joinedAt: true,
        user: { select: { id: true, username: true, avatarUrl: true } },
        role: { select: { id: true, name: true, color: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async kickMember(slug: string, targetUserId: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageMembers');
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot kick the server owner');
    await this.prisma.serverMember.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    return { ok: true };
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

  async addToWhitelist(slug: string, username: string, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageMembers');
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
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageMembers');
    await this.prisma.serverWhitelist.deleteMany({ where: { userId: targetUserId, serverId: server.id } });
    return { ok: true };
  }

  // ── Roles ─────────────────────────────────────────────────────────────

  async getRoles(slug: string) {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.serverRole.findMany({
      where: { serverId: server.id },
      orderBy: { position: 'desc' },
    });
  }

  async createRole(slug: string, dto: CreateRoleDto, requesterId: string, requesterRole: string) {
    const server = await this.assertPermission(slug, requesterId, requesterRole, 'manageRoles');
    const perms: ServerPermissions = { ...DEFAULT_PERMISSIONS, ...dto.permissions };
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

    const perms = dto.permissions
      ? { ...(role.permissions as any), ...dto.permissions }
      : undefined;

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
}

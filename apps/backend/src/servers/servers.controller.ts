import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, ForbiddenException, InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ServersService } from './servers.service';
import { CreateServerDto } from './dto/create-server.dto';
import { JoinServerDto } from './dto/join-server.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreateChannelDto } from './dto/create-channel.dto';

function user(req: Request) {
  return (req as any).user as { id: string; username: string; role: string };
}

function livekitEnv() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) throw new InternalServerErrorException('LiveKit not configured');
  return { apiKey, apiSecret, url };
}

@UseGuards(JwtAuthGuard)
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  // ── Servers ───────────────────────────────────────────────────────────

  @Get()
  list(@Req() req: Request) {
    return this.serversService.listServers(user(req).id);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.serversService.getServer(slug);
  }

  @Get(':slug/unread')
  getUnread(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.getServerUnread(slug, user(req).id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateServerDto, @Req() req: Request) {
    return this.serversService.createServer(dto, user(req).id);
  }

  @Patch(':slug/icon')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  updateIcon(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const { id, role } = user(req);
    return this.serversService.updateIcon(slug, file, id, role);
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: Partial<CreateServerDto>, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.updateServer(slug, dto, id, role);
  }

  @Delete(':slug')
  delete(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.deleteServer(slug, user(req).id);
  }

  // ── LiveKit (Spatial servers) ─────────────────────────────────────────

  @Get(':slug/livekit-token')
  async getLivekitToken(@Param('slug') slug: string, @Req() req: Request) {
    const { id, username } = user(req);
    const isMember = await this.serversService.isServerMember(slug, id);
    if (!isMember) throw new ForbiddenException('Not a member');
    const lk = livekitEnv();
    const token = new AccessToken(lk.apiKey, lk.apiSecret, { identity: id, name: username, ttl: '4h' });
    token.addGrant({ roomJoin: true, room: `spatial-${slug}`, canPublish: true, canSubscribe: true, canPublishData: true });
    return { token: await token.toJwt(), url: lk.url };
  }

  // ── Membership ────────────────────────────────────────────────────────

  @Post(':slug/join')
  join(@Param('slug') slug: string, @Body() dto: JoinServerDto, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.joinServer(slug, id, role, dto.password);
  }

  @Post(':slug/leave')
  leave(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.leaveServer(slug, user(req).id);
  }

  @Get(':slug/members')
  getMembers(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.getMembers(slug, user(req).id);
  }

  @Delete(':slug/members/:userId')
  kick(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.kickMember(slug, userId, id, role);
  }

  @Patch(':slug/members/:userId/nickname')
  setMemberNickname(
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @Body('nickname') nickname: string | undefined,
    @Req() req: Request,
  ) {
    return this.serversService.setMemberNickname(slug, targetUserId, nickname ?? null, user(req).id);
  }

  @Patch(':slug/members/:userId/role')
  assignRole(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Body('roleId') roleId: string | null,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.assignRole(slug, userId, roleId, id, role);
  }

  // ── Bans ──────────────────────────────────────────────────────────────

  @Post(':slug/bans')
  banMember(
    @Param('slug') slug: string,
    @Body() body: { userId: string; reason?: string },
    @Req() req: Request,
  ) {
    return this.serversService.banMember(slug, body.userId, user(req).id, body.reason);
  }

  @Delete(':slug/bans/:userId')
  unbanMember(
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @Req() req: Request,
  ) {
    return this.serversService.unbanMember(slug, targetUserId, user(req).id);
  }

  @Get(':slug/bans')
  getBans(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.getBans(slug, user(req).id);
  }

  // ── Channels ──────────────────────────────────────────────────────────

  @Post(':slug/channels')
  createChannel(@Param('slug') slug: string, @Body() dto: CreateChannelDto, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.createChannel(slug, dto, id, role);
  }

  @Patch(':slug/channels/:channelId')
  updateChannel(
    @Param('slug') slug: string,
    @Param('channelId') channelId: string,
    @Body() dto: Partial<CreateChannelDto>,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.updateChannel(slug, channelId, dto, id, role);
  }

  @Delete(':slug/channels/:channelId')
  deleteChannel(@Param('slug') slug: string, @Param('channelId') channelId: string, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.deleteChannel(slug, channelId, id, role);
  }

  // ── Whitelist ─────────────────────────────────────────────────────────

  @Get(':slug/whitelist')
  getWhitelist(@Param('slug') slug: string, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.getWhitelist(slug, id, role);
  }

  @Post(':slug/whitelist')
  addToWhitelist(
    @Param('slug') slug: string,
    @Body('username') username: string,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.addToWhitelist(slug, username, id, role);
  }

  @Delete(':slug/whitelist/:userId')
  removeFromWhitelist(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.removeFromWhitelist(slug, userId, id, role);
  }

  // ── Roles ─────────────────────────────────────────────────────────────

  @Get(':slug/roles')
  getRoles(@Param('slug') slug: string, @Req() req: Request) {
    return this.serversService.getRoles(slug, user(req).id);
  }

  @Post(':slug/roles')
  createRole(
    @Param('slug') slug: string,
    @Body() dto: CreateRoleDto,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.createRole(slug, dto, id, role);
  }

  @Patch(':slug/roles/:roleId')
  updateRole(
    @Param('slug') slug: string,
    @Param('roleId') roleId: string,
    @Body() dto: Partial<CreateRoleDto>,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.updateRole(slug, roleId, dto, id, role);
  }

  @Delete(':slug/roles/:roleId')
  deleteRole(
    @Param('slug') slug: string,
    @Param('roleId') roleId: string,
    @Req() req: Request,
  ) {
    const { id, role } = user(req);
    return this.serversService.deleteRole(slug, roleId, id, role);
  }
}

import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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

@UseGuards(JwtAuthGuard)
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  // ── Servers ───────────────────────────────────────────────────────────

  @Get()
  list() {
    return this.serversService.listServers();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.serversService.getServer(slug);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateServerDto, @Req() req: Request) {
    return this.serversService.createServer(dto, user(req).id);
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: Partial<CreateServerDto>, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.updateServer(slug, dto, id, role);
  }

  @Delete(':slug')
  delete(@Param('slug') slug: string, @Req() req: Request) {
    const { id, role } = user(req);
    return this.serversService.deleteServer(slug, id, role);
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
  getMembers(@Param('slug') slug: string) {
    return this.serversService.getMembers(slug);
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
  getWhitelist(@Param('slug') slug: string) {
    return this.serversService.getWhitelist(slug);
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
  getRoles(@Param('slug') slug: string) {
    return this.serversService.getRoles(slug);
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

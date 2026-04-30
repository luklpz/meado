import {
  Controller, Get, Post, Delete, Patch,
  Param, Body, Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  listRooms() {
    return this.roomsService.listRooms();
  }

  // ADMIN or higher can create rooms
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  createRoom(@Body() dto: CreateRoomDto, @Req() req: Request) {
    return this.roomsService.createRoom(dto, (req as any).user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/join')
  joinRoom(@Param('slug') slug: string, @Body() dto: JoinRoomDto, @Req() req: Request) {
    const { id, role } = (req as any).user;
    return this.roomsService.validateRoomAccess(slug, id, role, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug/livekit-token')
  async getLiveKitToken(@Param('slug') slug: string, @Req() req: Request) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) throw new BadRequestException('LiveKit not configured');

    const room = await this.roomsService.getRoomBySlug(slug);
    if (!room) throw new BadRequestException('Room not found');

    const user = (req as any).user;
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: apiKey,
        sub: user.username,
        name: user.username,
        nbf: now,
        exp: now + 3600,
        jti: Math.random().toString(36).slice(2),
        video: { room: room.slug, roomJoin: true, canPublish: true, canSubscribe: true },
      },
      apiSecret,
      { algorithm: 'HS256' },
    );
    return { token };
  }

  // Delete: SUPERADMIN or room ADMINROOM (checked in service)
  @UseGuards(JwtAuthGuard)
  @Delete(':slug')
  deleteRoom(@Param('slug') slug: string, @Req() req: Request) {
    const { id, role } = (req as any).user;
    return this.roomsService.deleteRoom(slug, id, role);
  }

  // Whitelist management: SUPERADMIN or room ADMINROOM
  @UseGuards(JwtAuthGuard)
  @Post(':slug/whitelist')
  addToWhitelist(
    @Param('slug') slug: string,
    @Body('username') username: string,
    @Req() req: Request,
  ) {
    const { id, role } = (req as any).user;
    return this.roomsService.addToWhitelist(slug, username, id, role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':slug/whitelist/:userId')
  removeFromWhitelist(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const { id, role } = (req as any).user;
    return this.roomsService.removeFromWhitelist(slug, userId, id, role);
  }

  // Room member management: SUPERADMIN or room ADMINROOM
  @UseGuards(JwtAuthGuard)
  @Get(':slug/members')
  getMembers(@Param('slug') slug: string) {
    return this.roomsService.getRoomMembers(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':slug/members/:userId/promote')
  promote(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const { id, role } = (req as any).user;
    return this.roomsService.setMemberRole(slug, userId, 'MODERATOR', id, role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':slug/members/:userId/demote')
  demote(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const { id, role } = (req as any).user;
    return this.roomsService.setMemberRole(slug, userId, 'USERROOM', id, role);
  }
}

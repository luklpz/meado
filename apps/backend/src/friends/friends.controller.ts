import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friendsService: FriendsService,
    private readonly gateway: MessagesGateway,
  ) {}

  @Get()
  getFriends(@Req() req: any) {
    return this.friendsService.getFriends(req.user.id, this.gateway.onlineUsers);
  }

  @Get('pending')
  getPending(@Req() req: any) {
    return this.friendsService.getPending(req.user.id);
  }

  @Post('request')
  async sendRequest(@Req() req: any, @Body() body: { identifier: string }) {
    const friendship = await this.friendsService.sendRequest(req.user.id, body.identifier);
    const sender = (friendship as any).sender;
    this.gateway.emitToUser(friendship.receiverId, 'friend:request', {
      id: friendship.id,
      user: { id: sender.id, username: sender.username, avatarUrl: sender.avatarUrl ?? null },
      createdAt: (friendship.createdAt as Date).toISOString(),
    });
    return friendship;
  }

  @Post('accept/:id')
  accept(@Req() req: any, @Param('id') id: string) {
    return this.friendsService.accept(req.user.id, id);
  }

  @Patch(':id/alias')
  setAlias(@Req() req: any, @Param('id') id: string, @Body() body: { alias?: string }) {
    return this.friendsService.setAlias(req.user.id, id, body.alias ?? null);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.friendsService.remove(req.user.id, id);
  }

  @Post('block/:targetId')
  block(@Req() req: any, @Param('targetId') targetId: string) {
    return this.friendsService.block(req.user.id, targetId);
  }

  @Delete('block/:targetId')
  unblock(@Req() req: any, @Param('targetId') targetId: string) {
    return this.friendsService.unblock(req.user.id, targetId);
  }
}

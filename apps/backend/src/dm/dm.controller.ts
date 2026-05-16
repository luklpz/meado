import {
  Controller, Get, Post, Param, Body, Req, UseGuards, Query,
} from '@nestjs/common';
import { DmService } from './dm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @Get()
  getConversations(@Req() req: any) {
    return this.dmService.getConversations(req.user.id);
  }

  @Get(':id/messages')
  getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dmService.getMessages(id, req.user.id, before, limit ? parseInt(limit) : 50);
  }

  @Post()
  getOrCreate(@Req() req: any, @Body() body: { userIds: string[]; name?: string; group?: boolean }) {
    if (body.group) {
      return this.dmService.createGroup(req.user.id, body.userIds, body.name);
    }
    return this.dmService.getOrCreate(req.user.id, body.userIds);
  }

  @Post(':id/messages')
  sendMessage(@Req() req: any, @Param('id') id: string, @Body() body: { content: string }) {
    return this.dmService.sendMessage(id, req.user.id, body.content);
  }

  @Post(':id/members')
  addMember(@Req() req: any, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.dmService.addMember(id, req.user.id, body.userId);
  }
}

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Query, BadRequestException,
} from '@nestjs/common';
import { Inject, forwardRef } from '@nestjs/common';
import { DmService } from './dm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';

function isAllowedAttachmentUrl(url: string) {
  return url.startsWith(CLOUDINARY_PREFIX) || url.startsWith(DRIVE_PREFIX);
}

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(
    private readonly dmService: DmService,
    @Inject(forwardRef(() => MessagesGateway)) private readonly gateway: MessagesGateway,
  ) {}

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
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.dmService.getMessages(id, req.user.id, before, isNaN(parsedLimit) ? 50 : parsedLimit);
  }

  @Post()
  getOrCreate(@Req() req: any, @Body() body: { userIds: string[]; name?: string; group?: boolean }) {
    if (body.group) {
      return this.dmService.createGroup(req.user.id, body.userIds, body.name);
    }
    return this.dmService.getOrCreate(req.user.id, body.userIds);
  }

  @Post(':id/messages')
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { content?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number; attachmentMimeType?: string },
  ) {
    const { content, attachmentUrl, attachmentName, attachmentSize, attachmentMimeType } = body;
    let attachments: { url: string; name: string; size: number; mimeType: string }[] | undefined;
    if (attachmentUrl && attachmentName) {
      if (!isAllowedAttachmentUrl(attachmentUrl)) throw new BadRequestException('Invalid attachment URL');
      attachments = [{
        url: attachmentUrl,
        name: attachmentName,
        size: attachmentSize ?? 0,
        mimeType: attachmentMimeType ?? 'application/octet-stream',
      }];
    }
    const message = await this.dmService.sendMessage(id, req.user.id, content, attachments);
    this.gateway.broadcastDmMessageCreated(id, message);
    return message;
  }

  @Post(':id/members')
  async addMember(@Req() req: any, @Param('id') id: string, @Body() body: { userId: string }) {
    const { user, conversation } = await this.dmService.addMember(id, req.user.id, body.userId);
    this.gateway.broadcastDmMemberAdded(id, user, conversation);
    return user;
  }

  @Patch(':id/messages/:messageId')
  async editMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body('content') content: string,
  ) {
    const message = await this.dmService.editMessage(messageId, req.user.id, content, id);
    this.gateway.broadcastDmMessageUpdated(message.conversationId, message);
    return message;
  }

  @Delete(':id/messages/:messageId')
  async deleteMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.dmService.deleteMessage(messageId, req.user.id, id);
    this.gateway.broadcastDmMessageDeleted(result.conversationId, messageId);
    return result;
  }
}

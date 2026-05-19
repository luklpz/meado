import * as jwt from 'jsonwebtoken';
import { Logger } from '@nestjs/common';
import {
  WebSocketGateway, WebSocketServer,
  SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import type { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { DmService } from '../dm/dm.service';
import { FriendsService } from '../friends/friends.service';

interface AuthSocket extends Socket {
  user?: { id: string; username: string; role: string; avatarUrl?: string | null };
}

// channelId → Map<userId, { username, avatarUrl }>
const voiceRooms = new Map<string, Map<string, { userId: string; username: string; avatarUrl?: string | null }>>();
// channelId → Map<userId, username>
const typingUsers = new Map<string, Map<string, string>>();
// conversationId → Map<userId, username>
const dmTypingUsers = new Map<string, Map<string, string>>();
// userId → timeout handle for auto-clearing typing state
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const dmTypingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TYPING_TTL_MS = 8000;
const MAX_MSG_LENGTH = 4000;
const MSG_RATE_LIMIT_MS = 500; // min ms between messages per user
const REACTION_RATE_LIMIT_MS = 250;
// userId → last message timestamp (channel + dm shared bucket)
const msgLastSent = new Map<string, number>();
const reactionLastToggled = new Map<string, number>();

@SkipThrottle()
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → Set<socketId> — used for online presence
  readonly onlineUsers = new Set<string>();
  private readonly userSockets = new Map<string, Set<string>>();

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly dmService: DmService,
    private readonly friendsService: FriendsService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) { client.disconnect(); return; }
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) { this.logger.error('JWT_SECRET not set — rejecting WS connection'); client.disconnect(); return; }
      const payload = jwt.verify(token, secret) as any;
      if (payload.type !== 'socket') { this.logger.warn(`WS auth rejected: wrong token type (${payload.type}) from ${client.handshake.address}`); client.disconnect(); return; }
      client.user = { id: payload.id, username: payload.username, role: payload.role, avatarUrl: payload.avatarUrl ?? null };

      const userId = client.user.id;
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
      this.userSockets.get(userId)!.add(client.id);
      this.onlineUsers.add(userId);

      // Notify friends this user came online
      const friendIds = await this.friendsService.getFriendIds(userId);
      for (const fid of friendIds) {
        const sockets = this.userSockets.get(fid);
        if (sockets) {
          for (const sid of sockets) {
            this.server.to(sid).emit('presence:update', { userId, online: true });
          }
        }
      }
    } catch (e) {
      this.logger.warn(`WS auth failed from ${client.handshake.address}: ${(e as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (!client.user) return;
    const userId = client.user.id;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        msgLastSent.delete(userId);
        reactionLastToggled.delete(userId);
        // Notify friends offline (fire-and-forget)
        this.friendsService.getFriendIds(userId).then(friendIds => {
          for (const fid of friendIds) {
            const fSockets = this.userSockets.get(fid);
            if (fSockets) {
              for (const sid of fSockets) {
                this.server.to(sid).emit('presence:update', { userId, online: false });
              }
            }
          }
        });
      }
    }

    for (const [channelId, members] of voiceRooms.entries()) {
      if (members.has(userId)) {
        members.delete(userId);
        this.server.to(`voice:${channelId}`).emit('voice:left', { channelId, userId });
        client.leave(`voice:${channelId}`);
        if (members.size === 0) voiceRooms.delete(channelId);
      }
    }
    for (const [channelId, typers] of typingUsers.entries()) {
      if (typers.has(userId)) {
        const timerKey = `${userId}:${channelId}`;
        clearTimeout(typingTimers.get(timerKey));
        typingTimers.delete(timerKey);
        typers.delete(userId);
        this.server.to(`channel:${channelId}`).emit('typing:update', { channelId, usernames: Array.from(typers.values()) });
        if (typers.size === 0) typingUsers.delete(channelId);
      }
    }
    for (const [convId, typers] of dmTypingUsers.entries()) {
      if (typers.has(userId)) {
        const timerKey = `${userId}:${convId}`;
        clearTimeout(dmTypingTimers.get(timerKey));
        dmTypingTimers.delete(timerKey);
        typers.delete(userId);
        this.server.to(`dm:${convId}`).emit('dm:typing:update', { conversationId: convId, usernames: Array.from(typers.values()) });
        if (typers.size === 0) dmTypingUsers.delete(convId);
      }
    }
  }

  // ── Text channel ──────────────────────────────────────────────────────

  @SubscribeMessage('channel:join')
  async handleChannelJoin(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    const ok = await this.messagesService.verifyChannelMember(payload.channelId, client.user.id);
    if (!ok) return;
    client.join(`channel:${payload.channelId}`);
  }

  @SubscribeMessage('channel:leave')
  handleChannelLeave(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    client.leave(`channel:${payload.channelId}`);
  }

  @SubscribeMessage('message:send')
  async handleMessageSend(client: AuthSocket, payload: { channelId: string; content: string }) {
    if (!client.user) return;
    if (!payload.content?.trim() || payload.content.length > MAX_MSG_LENGTH) return;
    const now = Date.now();
    const last = msgLastSent.get(client.user.id) ?? 0;
    if (now - last < MSG_RATE_LIMIT_MS) return;
    msgLastSent.set(client.user.id, now);
    const ok = await this.messagesService.verifyChannelMember(payload.channelId, client.user.id);
    if (!ok) return;
    try {
      const message = await this.messagesService.createMessage(payload.channelId, client.user.id, payload.content);
      this.server.to(`channel:${payload.channelId}`).emit('message:created', message);
    } catch (e) { this.logger.error('handleMessageSend', e); }
  }

  // ── Typing ────────────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    if (!client.rooms.has(`channel:${payload.channelId}`)) return;
    const timerKey = `${client.user.id}:${payload.channelId}`;
    if (!typingUsers.has(payload.channelId)) typingUsers.set(payload.channelId, new Map());
    typingUsers.get(payload.channelId)!.set(client.user.id, client.user.username);
    const usernames = Array.from(typingUsers.get(payload.channelId)!.values());
    client.to(`channel:${payload.channelId}`).emit('typing:update', { channelId: payload.channelId, usernames });

    clearTimeout(typingTimers.get(timerKey));
    typingTimers.set(timerKey, setTimeout(() => {
      typingTimers.delete(timerKey);
      this.handleTypingStop(client, payload);
    }, TYPING_TTL_MS));
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    if (!client.rooms.has(`channel:${payload.channelId}`)) return;
    const timerKey = `${client.user.id}:${payload.channelId}`;
    clearTimeout(typingTimers.get(timerKey));
    typingTimers.delete(timerKey);
    const typers = typingUsers.get(payload.channelId);
    if (!typers) return;
    typers.delete(client.user.id);
    if (typers.size === 0) typingUsers.delete(payload.channelId);
    const usernames = typers ? Array.from(typers.values()) : [];
    client.to(`channel:${payload.channelId}`).emit('typing:update', { channelId: payload.channelId, usernames });
  }

  // ── Voice channel ─────────────────────────────────────────────────────

  @SubscribeMessage('voice:join')
  async handleVoiceJoin(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    const ok = await this.messagesService.verifyChannelMember(payload.channelId, client.user.id);
    if (!ok) return;

    const channel = await this.messagesService.getChannel(payload.channelId);
    if (!channel || channel.type !== 'VOICE') return;

    if (!voiceRooms.has(payload.channelId)) voiceRooms.set(payload.channelId, new Map());
    const room = voiceRooms.get(payload.channelId)!;

    const member = { userId: client.user.id, username: client.user.username, avatarUrl: client.user.avatarUrl };
    room.set(client.user.id, member);
    client.join(`voice:${payload.channelId}`);

    client.emit('voice:state', { channelId: payload.channelId, members: Array.from(room.values()) });
    client.to(`voice:${payload.channelId}`).emit('voice:joined', { channelId: payload.channelId, member });
  }

  @SubscribeMessage('server:subscribe')
  async handleServerSubscribe(client: AuthSocket, payload: { serverId: string; channelIds: string[] }) {
    if (!client.user) return;
    if (!Array.isArray(payload.channelIds) || payload.channelIds.length === 0) return;
    const ok = await this.messagesService.verifyServerMember(payload.serverId, client.user.id);
    if (!ok) return;
    for (const channelId of payload.channelIds) {
      const room = voiceRooms.get(channelId);
      if (room && room.size > 0) {
        client.emit('voice:state', { channelId, members: Array.from(room.values()) });
      }
    }
  }

  @SubscribeMessage('voice:leave')
  handleVoiceLeave(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    const room = voiceRooms.get(payload.channelId);
    if (room) {
      room.delete(client.user.id);
      if (room.size === 0) voiceRooms.delete(payload.channelId);
    }
    this.server.to(`voice:${payload.channelId}`).emit('voice:left', { channelId: payload.channelId, userId: client.user.id });
    client.leave(`voice:${payload.channelId}`);
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  @SubscribeMessage('reaction:toggle')
  async handleReactionToggle(client: AuthSocket, payload: { messageId: string; emoji: string }) {
    if (!client.user) return;
    const now = Date.now();
    const lastReaction = reactionLastToggled.get(client.user.id) ?? 0;
    if (now - lastReaction < REACTION_RATE_LIMIT_MS) return;
    reactionLastToggled.set(client.user.id, now);
    try {
      const result = await this.messagesService.toggleReaction(payload.messageId, client.user.id, payload.emoji);
      this.server.to(`channel:${result.channelId}`).emit('reaction:updated', result);
    } catch (e) { this.logger.error('handleReactionToggle', e); }
  }

  // ── Direct Messages ───────────────────────────────────────────────────

  @SubscribeMessage('dm:join')
  async handleDmJoin(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    const ok = await this.dmService.isMember(payload.conversationId, client.user.id);
    if (!ok) return;
    client.join(`dm:${payload.conversationId}`);
  }

  @SubscribeMessage('dm:leave')
  handleDmLeave(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    client.leave(`dm:${payload.conversationId}`);
  }

  @SubscribeMessage('dm:send')
  async handleDmSend(client: AuthSocket, payload: { conversationId: string; content: string }) {
    if (!client.user) return;
    if (!payload.content?.trim() || payload.content.length > MAX_MSG_LENGTH) return;
    const now = Date.now();
    const last = msgLastSent.get(client.user.id) ?? 0;
    if (now - last < MSG_RATE_LIMIT_MS) return;
    msgLastSent.set(client.user.id, now);
    try {
      const message = await this.dmService.sendMessage(payload.conversationId, client.user.id, payload.content);
      this.server.to(`dm:${payload.conversationId}`).emit('dm:message:created', message);
    } catch (e) { this.logger.error('handleDmSend', e); }
  }

  @SubscribeMessage('dm:reaction:toggle')
  async handleDmReactionToggle(client: AuthSocket, payload: { messageId: string; emoji: string }) {
    if (!client.user) return;
    const now = Date.now();
    const lastReaction = reactionLastToggled.get(client.user.id) ?? 0;
    if (now - lastReaction < REACTION_RATE_LIMIT_MS) return;
    reactionLastToggled.set(client.user.id, now);
    try {
      const result = await this.dmService.toggleDmReaction(payload.messageId, client.user.id, payload.emoji);
      this.server.to(`dm:${result.conversationId}`).emit('dm:reaction:updated', result);
    } catch (e) { this.logger.error('handleDmReactionToggle', e); }
  }

  @SubscribeMessage('dm:typing:start')
  handleDmTypingStart(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    if (!client.rooms.has(`dm:${payload.conversationId}`)) return;
    const timerKey = `${client.user.id}:${payload.conversationId}`;
    if (!dmTypingUsers.has(payload.conversationId)) dmTypingUsers.set(payload.conversationId, new Map());
    dmTypingUsers.get(payload.conversationId)!.set(client.user.id, client.user.username);
    const usernames = Array.from(dmTypingUsers.get(payload.conversationId)!.values());
    client.to(`dm:${payload.conversationId}`).emit('dm:typing:update', { conversationId: payload.conversationId, usernames });

    clearTimeout(dmTypingTimers.get(timerKey));
    dmTypingTimers.set(timerKey, setTimeout(() => {
      dmTypingTimers.delete(timerKey);
      this.handleDmTypingStop(client, payload);
    }, TYPING_TTL_MS));
  }

  @SubscribeMessage('dm:typing:stop')
  handleDmTypingStop(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    if (!client.rooms.has(`dm:${payload.conversationId}`)) return;
    const timerKey = `${client.user.id}:${payload.conversationId}`;
    clearTimeout(dmTypingTimers.get(timerKey));
    dmTypingTimers.delete(timerKey);
    const typers = dmTypingUsers.get(payload.conversationId);
    if (!typers) return;
    typers.delete(client.user.id);
    if (typers.size === 0) dmTypingUsers.delete(payload.conversationId);
    const usernames = typers ? Array.from(typers.values()) : [];
    client.to(`dm:${payload.conversationId}`).emit('dm:typing:update', { conversationId: payload.conversationId, usernames });
  }

  // ── Helpers (called from controller after REST ops) ───────────────────

  emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const sid of sockets) {
      this.server.to(sid).emit(event, payload);
    }
  }

  broadcastMessageCreated(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('message:created', message);
  }

  broadcastMessageUpdated(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('message:updated', message);
  }

  broadcastMessageDeleted(channelId: string, messageId: string) {
    this.server.to(`channel:${channelId}`).emit('message:deleted', { messageId, channelId });
  }

  broadcastDmMessageCreated(conversationId: string, message: any) {
    this.server.to(`dm:${conversationId}`).emit('dm:message:created', message);
  }

  broadcastDmMessageUpdated(conversationId: string, message: any) {
    this.server.to(`dm:${conversationId}`).emit('dm:message:updated', message);
  }

  broadcastDmMessageDeleted(conversationId: string, messageId: string) {
    this.server.to(`dm:${conversationId}`).emit('dm:message:deleted', { messageId, conversationId });
  }
}

import * as jwt from 'jsonwebtoken';
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

@SkipThrottle()
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → Set<socketId> — used for online presence
  readonly onlineUsers = new Set<string>();
  private readonly userSockets = new Map<string, Set<string>>();

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
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (payload.type !== 'socket') { client.disconnect(); return; }
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
    } catch {
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
        typers.delete(userId);
        this.server.to(`channel:${channelId}`).emit('typing:update', { channelId, usernames: Array.from(typers.values()) });
        if (typers.size === 0) typingUsers.delete(channelId);
      }
    }
    for (const [convId, typers] of dmTypingUsers.entries()) {
      if (typers.has(userId)) {
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
    client.leave(`channel:${payload.channelId}`);
  }

  @SubscribeMessage('message:send')
  async handleMessageSend(client: AuthSocket, payload: { channelId: string; content: string }) {
    if (!client.user) return;
    const ok = await this.messagesService.verifyChannelMember(payload.channelId, client.user.id);
    if (!ok) return;
    try {
      const message = await this.messagesService.createMessage(payload.channelId, client.user.id, payload.content);
      this.server.to(`channel:${payload.channelId}`).emit('message:created', message);
    } catch { /* invalid message — ignore */ }
  }

  // ── Typing ────────────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
    if (!typingUsers.has(payload.channelId)) typingUsers.set(payload.channelId, new Map());
    typingUsers.get(payload.channelId)!.set(client.user.id, client.user.username);
    const usernames = Array.from(typingUsers.get(payload.channelId)!.values());
    client.to(`channel:${payload.channelId}`).emit('typing:update', { channelId: payload.channelId, usernames });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(client: AuthSocket, payload: { channelId: string }) {
    if (!client.user) return;
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
    try {
      const result = await this.messagesService.toggleReaction(payload.messageId, client.user.id, payload.emoji);
      this.server.to(`channel:${result.channelId}`).emit('reaction:updated', result);
    } catch { /* ignore */ }
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
    client.leave(`dm:${payload.conversationId}`);
  }

  @SubscribeMessage('dm:send')
  async handleDmSend(client: AuthSocket, payload: { conversationId: string; content: string }) {
    if (!client.user) return;
    try {
      const message = await this.dmService.sendMessage(payload.conversationId, client.user.id, payload.content);
      this.server.to(`dm:${payload.conversationId}`).emit('dm:message:created', message);
    } catch { /* ignore */ }
  }

  @SubscribeMessage('dm:typing:start')
  handleDmTypingStart(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    if (!dmTypingUsers.has(payload.conversationId)) dmTypingUsers.set(payload.conversationId, new Map());
    dmTypingUsers.get(payload.conversationId)!.set(client.user.id, client.user.username);
    const usernames = Array.from(dmTypingUsers.get(payload.conversationId)!.values());
    client.to(`dm:${payload.conversationId}`).emit('dm:typing:update', { conversationId: payload.conversationId, usernames });
  }

  @SubscribeMessage('dm:typing:stop')
  handleDmTypingStop(client: AuthSocket, payload: { conversationId: string }) {
    if (!client.user) return;
    const typers = dmTypingUsers.get(payload.conversationId);
    if (!typers) return;
    typers.delete(client.user.id);
    if (typers.size === 0) dmTypingUsers.delete(payload.conversationId);
    const usernames = typers ? Array.from(typers.values()) : [];
    client.to(`dm:${payload.conversationId}`).emit('dm:typing:update', { conversationId: payload.conversationId, usernames });
  }

  // ── Helpers (called from controller after REST ops) ───────────────────

  broadcastMessageUpdated(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('message:updated', message);
  }

  broadcastMessageDeleted(channelId: string, messageId: string) {
    this.server.to(`channel:${channelId}`).emit('message:deleted', { messageId, channelId });
  }
}

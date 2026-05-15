import * as jwt from 'jsonwebtoken';
import {
  WebSocketGateway, WebSocketServer,
  SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import type { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';

interface AuthSocket extends Socket {
  user?: { id: string; username: string; role: string; avatarUrl?: string | null };
}

// channelId → Map<userId, { username, avatarUrl }>
const voiceRooms = new Map<string, Map<string, { userId: string; username: string; avatarUrl?: string | null }>>();
// channelId → Map<userId, username>
const typingUsers = new Map<string, Map<string, string>>();

@SkipThrottle()
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly messagesService: MessagesService) {}

  // ── Auth ──────────────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) { client.disconnect(); return; }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (payload.type !== 'socket') { client.disconnect(); return; }
      client.user = { id: payload.id, username: payload.username, role: payload.role, avatarUrl: payload.avatarUrl ?? null };
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (!client.user) return;
    for (const [channelId, members] of voiceRooms.entries()) {
      if (members.has(client.user.id)) {
        members.delete(client.user.id);
        this.server.to(`voice:${channelId}`).emit('voice:left', { channelId, userId: client.user.id });
        client.leave(`voice:${channelId}`);
        if (members.size === 0) voiceRooms.delete(channelId);
      }
    }
    for (const [channelId, typers] of typingUsers.entries()) {
      if (typers.has(client.user.id)) {
        typers.delete(client.user.id);
        this.server.to(`channel:${channelId}`).emit('typing:update', { channelId, usernames: Array.from(typers.values()) });
        if (typers.size === 0) typingUsers.delete(channelId);
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

    // Send current state to joiner
    client.emit('voice:state', { channelId: payload.channelId, members: Array.from(room.values()) });
    // Notify others
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

  // ── Helpers (called from controller after REST ops) ───────────────────

  broadcastMessageUpdated(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('message:updated', message);
  }

  broadcastMessageDeleted(channelId: string, messageId: string) {
    this.server.to(`channel:${channelId}`).emit('message:deleted', { messageId, channelId });
  }
}

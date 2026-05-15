import * as jwt from 'jsonwebtoken';
import {
  WebSocketGateway, WebSocketServer,
  SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';

interface AuthSocket extends Socket {
  user?: { id: string; username: string; role: string; avatarUrl?: string | null };
}

// channelId → Set of { userId, username, avatarUrl }
const voiceRooms = new Map<string, Map<string, { userId: string; username: string; avatarUrl?: string | null }>>();

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
    // Remove from all voice rooms on disconnect
    for (const [channelId, members] of voiceRooms.entries()) {
      if (members.has(client.user.id)) {
        members.delete(client.user.id);
        this.server.to(`voice:${channelId}`).emit('voice:left', { channelId, userId: client.user.id });
        client.leave(`voice:${channelId}`);
        if (members.size === 0) voiceRooms.delete(channelId);
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

  // ── Helpers (called from controller after REST ops) ───────────────────

  broadcastMessageUpdated(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('message:updated', message);
  }

  broadcastMessageDeleted(channelId: string, messageId: string) {
    this.server.to(`channel:${channelId}`).emit('message:deleted', { messageId, channelId });
  }
}

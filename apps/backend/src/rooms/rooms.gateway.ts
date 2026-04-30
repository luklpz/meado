import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomJoinPayload,
  PlayerMovePayload,
} from '../shared/types/socket-events.types';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketUser {
  id: string;
  username: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: GameServer;

  private readonly logger = new Logger(RoomsGateway.name);

  constructor(private readonly roomsService: RoomsService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway ready');
  }

  handleConnection(client: GameSocket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`No token from ${client.id} — disconnecting`);
      client.disconnect();
      return;
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as any;
      (client as any).user = { id: payload.sub, username: payload.username, role: payload.role } satisfies SocketUser;
      this.logger.log(`Connected: ${client.id} (${payload.username})`);
    } catch {
      this.logger.warn(`Invalid token from ${client.id} — disconnecting`);
      client.disconnect();
    }
  }

  handleDisconnect(client: GameSocket) {
    const user = (client as any).user as SocketUser | undefined;
    this.logger.log(`Disconnected: ${client.id}${user ? ` (${user.username})` : ''}`);
    const left = this.roomsService.removePlayer(client.id);
    if (left) {
      this.server.to(left.roomId).emit('player:left', { playerId: client.id });
    }
  }

  @SubscribeMessage('room:join')
  handleRoomJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: RoomJoinPayload,
  ) {
    const user = (client as any).user as SocketUser;
    // Always use the authenticated username — ignore whatever the client sent
    const player = this.roomsService.addPlayer(client.id, { ...payload, username: user.username });
    client.join(payload.roomId);

    const roomState = this.roomsService.getRoomState(payload.roomId);
    client.emit('room:state', roomState);
    client.to(payload.roomId).emit('player:joined', player);
  }

  @SubscribeMessage('player:move')
  handlePlayerMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: PlayerMovePayload,
  ) {
    const updated = this.roomsService.updatePosition(client.id, payload);
    if (updated) {
      client.to(updated.roomId).emit('player:moved', updated);
    }
  }
}

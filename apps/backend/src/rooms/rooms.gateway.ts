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
    this.logger.log(`Connected: ${client.id}`);
  }

  handleDisconnect(client: GameSocket) {
    this.logger.log(`Disconnected: ${client.id}`);
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
    const player = this.roomsService.addPlayer(client.id, payload);
    client.join(payload.roomId);

    // Send current room snapshot to the joining player
    const roomState = this.roomsService.getRoomState(payload.roomId);
    client.emit('room:state', roomState);

    // Announce arrival to everyone else in the room
    client.to(payload.roomId).emit('player:joined', player);
  }

  @SubscribeMessage('player:move')
  handlePlayerMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: PlayerMovePayload,
  ) {
    const updated = this.roomsService.updatePosition(client.id, payload);
    if (updated) {
      // Broadcast only to others in the same room (exclude sender)
      client.to(updated.roomId).emit('player:moved', updated);
    }
  }
}

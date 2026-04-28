import { Injectable } from '@nestjs/common';
import type {
  PlayerState,
  RoomJoinPayload,
  PlayerMovePayload,
  RoomStatePayload,
} from '../shared/types/socket-events.types';

@Injectable()
export class RoomsService {
  // In-memory store: socketId → PlayerState
  // Redis will replace this for horizontal scaling
  private readonly players = new Map<string, PlayerState>();

  addPlayer(socketId: string, payload: RoomJoinPayload): PlayerState {
    const player: PlayerState = {
      playerId: socketId,
      username: payload.username,
      x: 400,
      y: 300,
      roomId: payload.roomId,
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId: string): PlayerState | undefined {
    const player = this.players.get(socketId);
    if (player) this.players.delete(socketId);
    return player;
  }

  updatePosition(socketId: string, payload: PlayerMovePayload): PlayerState | undefined {
    const player = this.players.get(socketId);
    if (!player) return undefined;
    player.x = payload.x;
    player.y = payload.y;
    return player;
  }

  getRoomState(roomId: string): RoomStatePayload {
    const players = Array.from(this.players.values()).filter((p) => p.roomId === roomId);
    return { players };
  }
}

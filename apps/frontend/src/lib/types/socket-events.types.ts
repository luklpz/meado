export interface PlayerState {
  playerId: string;
  username: string;
  x: number;
  y: number;
  roomId: string;
}

export interface RoomJoinPayload {
  roomId: string;
  username: string;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
  roomId: string;
}

export interface RoomStatePayload {
  players: PlayerState[];
}

export interface PlayerLeftPayload {
  playerId: string;
}

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload) => void;
  'player:move': (payload: PlayerMovePayload) => void;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomStatePayload) => void;
  'player:joined': (payload: PlayerState) => void;
  'player:moved': (payload: PlayerState) => void;
  'player:left': (payload: PlayerLeftPayload) => void;
}

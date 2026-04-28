import { writable } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerState,
} from './types/socket-events.types.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function createSocketStore() {
  const socket = writable<GameSocket | null>(null);
  const connected = writable(false);
  const players = writable<Map<string, PlayerState>>(new Map());

  let _socket: GameSocket | null = null;

  function connect(serverUrl: string): GameSocket {
    if (_socket?.connected) return _socket;

    const s: GameSocket = io(serverUrl, { autoConnect: true, transports: ['websocket'] });

    s.on('connect', () => {
      connected.set(true);
      socket.set(s);
    });

    s.on('disconnect', () => {
      connected.set(false);
    });

    s.on('room:state', ({ players: initial }) => {
      const map = new Map<string, PlayerState>();
      initial.forEach((p) => map.set(p.playerId, p));
      players.set(map);
    });

    s.on('player:joined', (player) => {
      players.update((map) => new Map(map).set(player.playerId, player));
    });

    s.on('player:moved', (player) => {
      players.update((map) => new Map(map).set(player.playerId, player));
    });

    s.on('player:left', ({ playerId }) => {
      players.update((map) => {
        const next = new Map(map);
        next.delete(playerId);
        return next;
      });
    });

    _socket = s;
    socket.set(s);
    return s;
  }

  function disconnect() {
    _socket?.disconnect();
    _socket = null;
    socket.set(null);
    connected.set(false);
    players.set(new Map());
  }

  return { socket, connected, players, connect, disconnect };
}

export const socketStore = createSocketStore();

import { writable } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types/socket-events.types.js';

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type GameSocket = ChatSocket; // Phase 2 compat

function createSocketStore() {
  const socket = writable<ChatSocket | null>(null);
  const connected = writable(false);
  let _socket: ChatSocket | null = null;

  function connect(socketToken: string): ChatSocket {
    if (_socket?.connected) return _socket;
    if (_socket) { _socket.removeAllListeners(); _socket.disconnect(); }

    const url = import.meta.env.VITE_SOCKET_URL ?? '';
    const s: ChatSocket = io(url, {
      autoConnect: true,
      transports: ['websocket'],
      auth: { token: socketToken },
      withCredentials: true,
    });

    s.on('connect', () => { connected.set(true); socket.set(s); });
    s.on('disconnect', () => {
      connected.set(false);
      // Refresh socket token so reconnect attempts use a fresh 1h JWT
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.socketToken) (s as any).auth = { token: data.socketToken }; })
        .catch(() => {});
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
  }

  function raw(): ChatSocket | null { return _socket; }

  return { socket, connected, connect, disconnect, raw };
}

export const socketStore = createSocketStore();

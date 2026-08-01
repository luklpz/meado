import { writable } from 'svelte/store';
import type { RoomSocket } from './socket.js';

export interface ActiveVoice {
	channelId: string;
	channelName: string;
	serverId: string;
	serverSlug: string;
	serverName: string;
}

export const activeVoice = writable<ActiveVoice | null>(null);

// La conexión WS de la sala de voz activa (una por sala, ver lib/socket.ts) —
// no vive en un store reactivo porque no es serializable/no se renderiza,
// solo hace falta poder cerrarla desde cualquier sitio (leaveVoice() de la
// página de servidor, beforeunload en +layout.svelte).
let _activeVoiceSocket: RoomSocket | null = null;

export function setActiveVoiceSocket(socket: RoomSocket | null): void {
	_activeVoiceSocket = socket;
}

export function closeActiveVoiceSocket(): void {
	_activeVoiceSocket?.close();
	_activeVoiceSocket = null;
}

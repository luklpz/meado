import { writable, type Writable } from 'svelte/store';
import type { ClientToServerEvents, ServerToClientEvents } from './types/socket-events.types.js';

// Reemplaza socket.io-client por WebSocket nativo — el backend (Cloudflare
// Durable Objects) no habla el protocolo Socket.io. Cambio de modelo real,
// no solo de transporte: antes había UNA conexión con "rooms" multiplexadas
// server-side; ahora cada sala (canal/DM) es una conexión WS propia, más
// una conexión de "sesión" siempre activa para presencia/friend-requests/
// previews de DM en background (ver plan de migración, fase 3/4).
//
// El backoff de reconexión y el refresco del socketToken en cada intento
// los daba gratis socket.io-client — aquí es código nuevo.

type C2S = ClientToServerEvents;
type S2C = ServerToClientEvents;

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;
const RECONNECT_MULTIPLIER = 1.7;

function wsOrigin(): string {
	const configured = import.meta.env.VITE_SOCKET_URL as string | undefined;
	if (configured) return configured.replace(/^http/, 'ws');
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${location.host}`;
}

async function refreshSocketToken(): Promise<string | null> {
	try {
		const res = await fetch('/api/auth/me', { credentials: 'include' });
		if (!res.ok) return null;
		const data = await res.json();
		return data?.socketToken ?? null;
	} catch {
		return null;
	}
}

type Handler = (payload: unknown) => void;

/** Una conexión WS gestionada: reconecta sola con backoff, refresca el token en cada intento, expone .on()/.off()/.emit() */
class ManagedSocket {
	private ws: WebSocket | null = null;
	private token: string;
	private readonly path: string;
	private readonly listeners = new Map<string, Set<Handler>>();
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private closedByUser = false;
	readonly connected: Writable<boolean> = writable(false);

	constructor(path: string, token: string) {
		this.path = path;
		this.token = token;
		this.open();
	}

	private open(): void {
		const url = `${wsOrigin()}${this.path}?token=${encodeURIComponent(this.token)}`;
		const ws = new WebSocket(url);
		this.ws = ws;

		ws.onopen = () => {
			this.reconnectAttempt = 0;
			this.connected.set(true);
		};

		ws.onmessage = (event) => {
			let envelope: { type: string; payload: unknown };
			try {
				envelope = JSON.parse(event.data);
			} catch {
				return;
			}
			const handlers = this.listeners.get(envelope.type);
			if (handlers) for (const h of handlers) h(envelope.payload);
		};

		ws.onclose = () => {
			this.connected.set(false);
			if (!this.closedByUser) this.scheduleReconnect();
		};

		ws.onerror = () => {
			// onclose se dispara igualmente tras onerror — la reconexión se programa ahí
		};
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;
		const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * RECONNECT_MULTIPLIER ** this.reconnectAttempt);
		const jitter = delay * (0.85 + Math.random() * 0.3);
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			if (this.closedByUser) return;
			const fresh = await refreshSocketToken();
			if (fresh) this.token = fresh;
			if (!this.closedByUser) this.open();
		}, jitter);
	}

	on<K extends string>(event: K, handler: (payload: unknown) => void): void {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(handler);
	}

	off<K extends string>(event: K, handler: (payload: unknown) => void): void {
		this.listeners.get(event)?.delete(handler);
	}

	emit(type: string, payload: unknown): void {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, payload }));
	}

	get isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	close(): void {
		this.closedByUser = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.listeners.clear();
	}
}

/** Handle público de una sala (canal o DM) — misma superficie que la conexión de sesión */
export interface RoomSocket {
	on<K extends keyof S2C>(event: K, handler: (payload: Parameters<S2C[K]>[0]) => void): void;
	off<K extends keyof S2C>(event: K, handler: (payload: Parameters<S2C[K]>[0]) => void): void;
	emit<K extends keyof C2S>(event: K, payload: Parameters<C2S[K]>[0]): void;
	close(): void;
	readonly connected: Writable<boolean>;
	get isConnected(): boolean;
}

function createSocketStore() {
	let session: ManagedSocket | null = null;
	const connected = writable(false);
	const rooms = new Set<ManagedSocket>();

	function connect(socketToken: string): void {
		if (session) return;
		session = new ManagedSocket('/ws/session', socketToken);
		session.connected.subscribe((v) => connected.set(v));
	}

	function disconnect(): void {
		session?.close();
		session = null;
		connected.set(false);
		for (const room of rooms) room.close();
		rooms.clear();
	}

	/** Eventos de sesión: presence:update, friend:request, y previews de DM (dm:message:created/dm:reaction:updated/dm:conversation:joined) para conversaciones no abiertas ahora mismo */
	function on<K extends keyof S2C>(event: K, handler: (payload: Parameters<S2C[K]>[0]) => void): void {
		session?.on(event, handler as Handler);
	}

	function off<K extends keyof S2C>(event: K, handler: (payload: Parameters<S2C[K]>[0]) => void): void {
		session?.off(event, handler as Handler);
	}

	function openRoom(path: string, socketToken: string): RoomSocket {
		const ms = new ManagedSocket(path, socketToken);
		rooms.add(ms);
		return {
			on: (event, handler) => ms.on(event, handler as Handler),
			off: (event, handler) => ms.off(event, handler as Handler),
			emit: (event, payload) => ms.emit(event, payload),
			close: () => { ms.close(); rooms.delete(ms); },
			connected: ms.connected,
			get isConnected() { return ms.isConnected; },
		};
	}

	function joinChannel(channelId: string, socketToken: string): RoomSocket {
		return openRoom(`/ws/channel/${channelId}`, socketToken);
	}

	function joinDm(conversationId: string, socketToken: string): RoomSocket {
		return openRoom(`/ws/dm/${conversationId}`, socketToken);
	}

	return { connected, connect, disconnect, on, off, joinChannel, joinDm };
}

export const socketStore = createSocketStore();

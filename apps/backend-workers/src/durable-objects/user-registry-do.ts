import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createDb } from '../lib/db.js';
import { getFriendIds } from '../lib/friends.js';
import { verifyToken, type SocketTokenPayload } from '../lib/jwt.js';
import { wsSend } from '../lib/ws-protocol.js';

// Un UserRegistryDO por usuario (idFromName(userId)) — no un pool de shards
// por hash como sugería el plan original: a esta escala (≤100 usuarios) un
// DO por usuario es más simple y evita cualquier contención entre usuarios
// no relacionados, sin coste real adicional (los DOs están pensados para
// crearse en esta cantidad). Sustituye onlineUsers/userSockets (presencia),
// msgLastSent/reactionLastToggled/voiceJoinLastTime (rate limit global por
// usuario) y añade el puntero de "canal de voz activo" (invariante dura:
// nunca dos salas de voz a la vez), que el diseño de Socket.io de un único
// proceso resolvía con Maps compartidos y aquí necesita coordinación
// explícita entre DOs.
//
// Esta es también la conexión de "sesión" del modelo de conexión acordado:
// UNA conexión WS de fondo por usuario (no una por sala) para presencia,
// friend:request y previews de DM en conversaciones no abiertas.

const RATE_LIMITS = { msg: 500, reaction: 250, voiceJoin: 2000 } as const;
type RateLimitKind = keyof typeof RATE_LIMITS;

export class UserRegistryDO extends DurableObject<Env> {
	private userId: string | null = null;
	private readonly rateLimitTimestamps = new Map<RateLimitKind, number>();
	private _db?: PrismaClient;
	private db(): PrismaClient {
		if (!this._db) this._db = createDb(this.env);
		return this._db;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const token = url.searchParams.get('token');
		if (!token) return new Response('Unauthorized', { status: 401 });

		const payload = await verifyToken<SocketTokenPayload>(this.env.JWT_SECRET, token);
		if (!payload || payload.type !== 'socket') return new Response('Unauthorized', { status: 401 });

		this.userId = payload.id;
		const wasOnline = this.ctx.getWebSockets().length > 0;

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], ['session']);
		pair[1].serializeAttachment({ userId: payload.id, username: payload.username });

		if (!wasOnline) await this.notifyFriendsPresence(true);

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(): Promise<void> {
		// la conexión de sesión no recibe eventos del cliente en este diseño (solo push del servidor)
	}

	async webSocketClose(): Promise<void> {
		// No llamar a ws.close() aquí — la API de hibernación invoca este
		// handler DESPUÉS de que el socket ya se cerró; volver a cerrarlo
		// puede lanzar y abortar el resto de la función antes de notificar
		// a los amigos (bug real encontrado en la verificación de fase 5).
		const stillOnline = this.ctx.getWebSockets().length > 0;
		if (!stillOnline) await this.notifyFriendsPresence(false);
	}

	async webSocketError(): Promise<void> {
		await this.webSocketClose();
	}

	private async notifyFriendsPresence(online: boolean): Promise<void> {
		if (!this.userId) return;
		const db = this.db();
		const friendIds = await getFriendIds(db, this.userId);
		await Promise.all(
			friendIds.map((fid) => {
				const stub = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(fid));
				return stub.pushEvent('presence:update', { userId: this.userId, online }).catch(() => {});
			}),
		);
	}

	// ── RPC methods (llamados desde ChannelDO/DmDO y desde rutas REST vía lib/broadcast.ts) ──

	async pushEvent(type: string, payload: unknown): Promise<void> {
		for (const ws of this.ctx.getWebSockets('session')) wsSend(ws, type, payload);
	}

	async isOnline(): Promise<boolean> {
		return this.ctx.getWebSockets().length > 0;
	}

	/** true si la acción está permitida (y registra el timestamp); false si hay que descartarla por rate limit */
	async checkRateLimit(kind: RateLimitKind): Promise<boolean> {
		const now = Date.now();
		const last = this.rateLimitTimestamps.get(kind) ?? 0;
		if (now - last < RATE_LIMITS[kind]) return false;
		this.rateLimitTimestamps.set(kind, now);
		return true;
	}

	async getActiveVoiceChannel(): Promise<string | null> {
		return (await this.ctx.storage.get<string>('voiceChannelId')) ?? null;
	}

	/** Fija el nuevo canal de voz activo y devuelve el anterior (o null si no había ninguno) */
	async setActiveVoiceChannel(channelId: string): Promise<string | null> {
		const prev = (await this.ctx.storage.get<string>('voiceChannelId')) ?? null;
		await this.ctx.storage.put('voiceChannelId', channelId);
		return prev;
	}

	/** Limpia el puntero solo si sigue apuntando a channelId — evita que un cierre tardío de la sala vieja borre un puntero ya actualizado a una sala nueva */
	async clearActiveVoiceChannelIfCurrent(channelId: string): Promise<void> {
		const current = await this.ctx.storage.get<string>('voiceChannelId');
		if (current === channelId) await this.ctx.storage.delete('voiceChannelId');
	}
}

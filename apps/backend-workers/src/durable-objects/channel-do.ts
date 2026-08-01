import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createDb } from '../lib/db.js';
import { verifyToken, type SocketTokenPayload } from '../lib/jwt.js';
import { wsSend, wsBroadcast, parseWsMessage } from '../lib/ws-protocol.js';
import { verifyChannelMember, createChannelMessageChecked, toggleChannelReactionChecked } from '../lib/messages.js';

interface Attachment {
	userId: string;
	username: string;
	avatarUrl: string | null;
}

const TYPING_TTL_MS = 8000;

// Un ChannelDO por canal (texto O voz — cada fila Channel de la DB tiene su
// propio DO). Sustituye la porción de messages.gateway.ts scoped a un canal:
// voiceRooms[channelId], typingUsers[channelId]. El roster de voz NO se
// guarda en un Map propio — se deriva siempre de this.ctx.getWebSockets(),
// así nunca se desincroniza de las conexiones reales (importante porque
// los DOs pueden hibernar y perder estado en memoria que no esté en
// this.ctx.storage).
//
// Modelo de conexión: no hay channel:join/channel:leave/voice:leave como
// mensajes — abrir el WebSocket ES el join, cerrarlo ES el leave. Esto lo
// habilita el modelo "un WS por sala activa" acordado (ver plan de fase 3).
export class ChannelDO extends DurableObject<Env> {
	private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly typingUsersMap = new Map<string, string>(); // userId -> username, esta DO ya es de UN canal
	// El DO no conoce su propio "nombre" (idFromName) por API — se fija en
	// la primera conexión aceptada y se reutiliza (todas las conexiones de
	// esta instancia son, por construcción, del mismo channelId).
	private channelId: string | null = null;
	private _db?: PrismaClient;
	private db(): PrismaClient {
		if (!this._db) this._db = createDb(this.env);
		return this._db;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const token = url.searchParams.get('token');
		const channelId = url.pathname.split('/').filter(Boolean).pop();
		if (!token || !channelId) return new Response('Bad request', { status: 400 });

		const payload = await verifyToken<SocketTokenPayload>(this.env.JWT_SECRET, token);
		if (!payload || payload.type !== 'socket') return new Response('Unauthorized', { status: 401 });

		const db = this.db();
		const channel = await db.channel.findUnique({ where: { id: channelId } });
		if (!channel) return new Response('Channel not found', { status: 404 });
		if (!(await verifyChannelMember(db, channelId, payload.id))) return new Response('Forbidden', { status: 403 });

		this.channelId = channelId;
		const member: Attachment = { userId: payload.id, username: payload.username, avatarUrl: payload.avatarUrl };

		if (channel.type === 'VOICE') {
			// Invariante dura: nunca dos salas de voz activas a la vez. Handshake
			// con el UserRegistryDO del usuario ANTES de aceptar esta conexión —
			// si había un canal de voz previo, se expulsa esa conexión primero.
			const registry = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(payload.id));
			const prevChannelId = await registry.setActiveVoiceChannel(channelId);
			if (prevChannelId && prevChannelId !== channelId) {
				const prevDo = this.env.CHANNEL_DO.get(this.env.CHANNEL_DO.idFromName(prevChannelId));
				await prevDo.evictUser(payload.id).catch(() => {});
			}
		}

		const pair = new WebSocketPair();
		const tag = channel.type === 'VOICE' ? 'voice' : 'text';
		this.ctx.acceptWebSocket(pair[1], [tag]);
		pair[1].serializeAttachment(member);

		if (channel.type === 'VOICE') {
			const roster = this.getVoiceMembers();
			wsSend(pair[1], 'voice:state', { channelId, members: roster });
			wsBroadcast(this.ctx.getWebSockets('voice'), 'voice:joined', { channelId, member }, pair[1]);
		}

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		const msg = parseWsMessage(raw);
		if (!msg || !this.channelId) return;
		const attachment = ws.deserializeAttachment() as Attachment | null;
		if (!attachment) return;

		const db = this.db();
		const registry = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(attachment.userId));

		if (msg.type === 'message:send') {
			const payload = msg.payload as { content?: string };
			if (!(await registry.checkRateLimit('msg'))) return;
			const message = await createChannelMessageChecked(db, this.channelId, attachment.userId, payload.content ?? '');
			if (message) wsBroadcast(this.ctx.getWebSockets('text'), 'message:created', message);
			return;
		}

		if (msg.type === 'reaction:toggle') {
			const payload = msg.payload as { messageId: string; emoji: string };
			if (!(await registry.checkRateLimit('reaction'))) return;
			const result = await toggleChannelReactionChecked(db, payload.messageId, attachment.userId, payload.emoji);
			if (result) wsBroadcast(this.ctx.getWebSockets('text'), 'reaction:updated', result);
			return;
		}

		if (msg.type === 'typing:start') {
			this.handleTypingStart(ws, attachment);
			return;
		}

		if (msg.type === 'typing:stop') {
			this.handleTypingStop(attachment.userId, ws);
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.cleanupConnection(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.cleanupConnection(ws);
	}

	private async cleanupConnection(ws: WebSocket): Promise<void> {
		const attachment = ws.deserializeAttachment() as Attachment | null;
		if (!attachment || !this.channelId) return;

		const isVoice = this.ctx.getWebSockets('voice').includes(ws);
		if (isVoice) {
			// getWebSockets ya excluye la conexión que se está cerrando en este punto
			wsBroadcast(this.ctx.getWebSockets('voice'), 'voice:left', { channelId: this.channelId, userId: attachment.userId });
			// Compare-and-clear: si el usuario ya abrió otra sala de voz, el
			// puntero del registry apunta a esa otra sala y esto no hace nada
			// (evita que un cierre tardío de la sala vieja borre el puntero nuevo).
			const registry = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(attachment.userId));
			await registry.clearActiveVoiceChannelIfCurrent(this.channelId).catch(() => {});
		} else {
			this.handleTypingStop(attachment.userId);
		}
	}

	private getVoiceMembers(): Attachment[] {
		return this.ctx.getWebSockets('voice').map((ws) => ws.deserializeAttachment() as Attachment);
	}

	private handleTypingStart(ws: WebSocket, attachment: Attachment): void {
		if (!this.channelId) return;
		this.typingUsersMap.set(attachment.userId, attachment.username);
		const usernames = Array.from(this.typingUsersMap.values());
		wsBroadcast(this.ctx.getWebSockets('text'), 'typing:update', { channelId: this.channelId, usernames }, ws);

		clearTimeout(this.typingTimers.get(attachment.userId));
		this.typingTimers.set(attachment.userId, setTimeout(() => {
			this.typingTimers.delete(attachment.userId);
			this.handleTypingStop(attachment.userId, ws);
		}, TYPING_TTL_MS));
	}

	/** ws opcional: si se conoce la conexión que originó el stop (mensaje explícito o timeout), se excluye del broadcast — igual que el `client.to()` del gateway original, que nunca hace eco al que para de escribir */
	private handleTypingStop(userId: string, ws?: WebSocket): void {
		if (!this.channelId) return;
		clearTimeout(this.typingTimers.get(userId));
		this.typingTimers.delete(userId);
		if (!this.typingUsersMap.has(userId)) return;
		this.typingUsersMap.delete(userId);
		const usernames = Array.from(this.typingUsersMap.values());
		wsBroadcast(this.ctx.getWebSockets('text'), 'typing:update', { channelId: this.channelId, usernames }, ws);
	}

	// ── RPC (llamado desde otro ChannelDO en el handshake de voz, y desde rutas REST vía lib/broadcast.ts) ──

	/** Cierra la conexión de voz de userId en ESTA sala porque abrió otra — el propio webSocketClose hace el broadcast de voice:left, no duplicarlo aquí */
	async evictUser(userId: string): Promise<void> {
		for (const ws of this.ctx.getWebSockets('voice')) {
			const attachment = ws.deserializeAttachment() as Attachment | null;
			if (attachment?.userId === userId) {
				ws.close(1000, 'Evicted: joined another voice channel');
			}
		}
	}

	async getVoiceRoster(): Promise<Attachment[]> {
		return this.getVoiceMembers();
	}

	async broadcastMessageCreated(message: unknown): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('text'), 'message:created', message);
	}

	async broadcastMessageUpdated(message: unknown): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('text'), 'message:updated', message);
	}

	async broadcastMessageDeleted(messageId: string, channelId: string): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('text'), 'message:deleted', { messageId, channelId });
	}
}

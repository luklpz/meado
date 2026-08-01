import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.js';
import { createDb } from '../lib/db.js';
import { verifyToken, type SocketTokenPayload } from '../lib/jwt.js';
import { wsBroadcast, parseWsMessage } from '../lib/ws-protocol.js';
import { isDmMember, createDmMessageChecked, toggleDmReactionChecked, getDmMembers } from '../lib/dm-messages.js';

interface Attachment {
	userId: string;
	username: string;
}

const TYPING_TTL_MS = 8000;

// Un DmDO por conversación. Igual que ChannelDO (texto): abrir el WS es el
// join, cerrarlo el leave. Además, cada mensaje/reacción se reenvía también
// a la conexión de sesión (UserRegistryDO) de cada miembro que NO esté
// conectado a esta sala ahora mismo — es el mecanismo de "preview en la
// sidebar aunque no tengas la conversación abierta" que sustituye el
// dm:join-a-todas-mis-conversaciones de hoy (ver plan de fase 3/4, sección
// "modelo de conexión").
export class DmDO extends DurableObject<Env> {
	private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly typingUsersMap = new Map<string, string>();
	private conversationId: string | null = null;

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const token = url.searchParams.get('token');
		const conversationId = url.pathname.split('/').filter(Boolean).pop();
		if (!token || !conversationId) return new Response('Bad request', { status: 400 });

		const payload = await verifyToken<SocketTokenPayload>(this.env.JWT_SECRET, token);
		if (!payload || payload.type !== 'socket') return new Response('Unauthorized', { status: 401 });

		const db = createDb(this.env);
		if (!(await isDmMember(db, conversationId, payload.id))) return new Response('Forbidden', { status: 403 });

		this.conversationId = conversationId;
		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], ['dm']);
		pair[1].serializeAttachment({ userId: payload.id, username: payload.username } satisfies Attachment);

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		const msg = parseWsMessage(raw);
		if (!msg || !this.conversationId) return;
		const attachment = ws.deserializeAttachment() as Attachment | null;
		if (!attachment) return;

		const db = createDb(this.env);
		const registry = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(attachment.userId));

		if (msg.type === 'dm:send') {
			const payload = msg.payload as { content?: string };
			// Comparte el mismo cupo ("msg") que los mensajes de canal — igual que hoy
			if (!(await registry.checkRateLimit('msg'))) return;
			const message = await createDmMessageChecked(db, this.conversationId, attachment.userId, payload.content ?? '');
			if (message) await this.broadcastDmMessageCreated(message);
			return;
		}

		if (msg.type === 'dm:reaction:toggle') {
			const payload = msg.payload as { messageId: string; emoji: string };
			if (!(await registry.checkRateLimit('reaction'))) return;
			const result = await toggleDmReactionChecked(db, payload.messageId, attachment.userId, payload.emoji);
			if (result) wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:reaction:updated', result);
			return;
		}

		if (msg.type === 'dm:typing:start') {
			this.handleTypingStart(ws, attachment);
			return;
		}

		if (msg.type === 'dm:typing:stop') {
			this.handleTypingStop(attachment.userId, ws);
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const attachment = ws.deserializeAttachment() as Attachment | null;
		if (attachment) this.handleTypingStop(attachment.userId);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.webSocketClose(ws);
	}

	private handleTypingStart(ws: WebSocket, attachment: Attachment): void {
		if (!this.conversationId) return;
		this.typingUsersMap.set(attachment.userId, attachment.username);
		const usernames = Array.from(this.typingUsersMap.values());
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:typing:update', { conversationId: this.conversationId, usernames }, ws);

		clearTimeout(this.typingTimers.get(attachment.userId));
		this.typingTimers.set(attachment.userId, setTimeout(() => {
			this.typingTimers.delete(attachment.userId);
			this.handleTypingStop(attachment.userId, ws);
		}, TYPING_TTL_MS));
	}

	private handleTypingStop(userId: string, ws?: WebSocket): void {
		if (!this.conversationId) return;
		clearTimeout(this.typingTimers.get(userId));
		this.typingTimers.delete(userId);
		if (!this.typingUsersMap.has(userId)) return;
		this.typingUsersMap.delete(userId);
		const usernames = Array.from(this.typingUsersMap.values());
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:typing:update', { conversationId: this.conversationId, usernames }, ws);
	}

	/** Miembros conectados aquí ahora mismo — para no duplicar el push de sesión a quien ya recibe el mensaje por esta conexión */
	private connectedUserIds(): Set<string> {
		return new Set(this.ctx.getWebSockets('dm').map((ws) => (ws.deserializeAttachment() as Attachment).userId));
	}

	private async pushToOfflineMembers(type: string, payload: unknown): Promise<void> {
		if (!this.conversationId) return;
		const db = createDb(this.env);
		const memberIds = await getDmMembers(db, this.conversationId);
		const connected = this.connectedUserIds();
		await Promise.all(
			memberIds
				.filter((id) => !connected.has(id))
				.map((id) => {
					const stub = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(id));
					return stub.pushEvent(type, payload).catch(() => {});
				}),
		);
	}

	// ── RPC (llamado desde rutas REST vía lib/broadcast.ts) ──

	async broadcastDmMessageCreated(message: { conversationId: string }): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:message:created', message);
		await this.pushToOfflineMembers('dm:message:created', message);
	}

	async broadcastDmMessageUpdated(message: unknown): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:message:updated', message);
	}

	async broadcastDmMessageDeleted(messageId: string, conversationId: string): Promise<void> {
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:message:deleted', { messageId, conversationId });
	}

	async broadcastDmMemberAdded(newMember: { id: string }, conversation: unknown): Promise<void> {
		if (!this.conversationId) return;
		wsBroadcast(this.ctx.getWebSockets('dm'), 'dm:member:added', { conversationId: this.conversationId, member: newMember });
		const stub = this.env.USER_REGISTRY_DO.get(this.env.USER_REGISTRY_DO.idFromName(newMember.id));
		await stub.pushEvent('dm:conversation:joined', { conversationId: this.conversationId, conversation }).catch(() => {});
	}
}

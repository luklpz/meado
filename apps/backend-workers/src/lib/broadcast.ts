// Puente REST -> Durable Object. Los controllers REST (routes/channels.ts,
// routes/dm.ts, routes/friends.ts) llaman a estas funciones tras escribir en
// Prisma, igual que hoy MessagesController/DmController/FriendsController
// llaman a métodos de MessagesGateway inyectado directamente.
import type { Env } from '../env.js';

export function broadcastMessageCreated(env: Env, channelId: string, message: unknown): void {
	const stub = env.CHANNEL_DO.get(env.CHANNEL_DO.idFromName(channelId));
	stub.broadcastMessageCreated(message).catch((e) => console.error('broadcastMessageCreated', e));
}

export function broadcastMessageUpdated(env: Env, channelId: string, message: unknown): void {
	const stub = env.CHANNEL_DO.get(env.CHANNEL_DO.idFromName(channelId));
	stub.broadcastMessageUpdated(message).catch((e) => console.error('broadcastMessageUpdated', e));
}

export function broadcastMessageDeleted(env: Env, channelId: string, messageId: string): void {
	const stub = env.CHANNEL_DO.get(env.CHANNEL_DO.idFromName(channelId));
	stub.broadcastMessageDeleted(messageId, channelId).catch((e) => console.error('broadcastMessageDeleted', e));
}

export function broadcastDmMessageCreated(env: Env, conversationId: string, message: { conversationId: string }): void {
	const stub = env.DM_DO.get(env.DM_DO.idFromName(conversationId));
	stub.broadcastDmMessageCreated(message).catch((e) => console.error('broadcastDmMessageCreated', e));
}

export function broadcastDmMessageUpdated(env: Env, conversationId: string, message: unknown): void {
	const stub = env.DM_DO.get(env.DM_DO.idFromName(conversationId));
	stub.broadcastDmMessageUpdated(message).catch((e) => console.error('broadcastDmMessageUpdated', e));
}

export function broadcastDmMessageDeleted(env: Env, conversationId: string, messageId: string): void {
	const stub = env.DM_DO.get(env.DM_DO.idFromName(conversationId));
	stub.broadcastDmMessageDeleted(messageId, conversationId).catch((e) => console.error('broadcastDmMessageDeleted', e));
}

export function broadcastDmMemberAdded(env: Env, conversationId: string, newMember: { id: string }, conversation: unknown): void {
	const stub = env.DM_DO.get(env.DM_DO.idFromName(conversationId));
	stub.broadcastDmMemberAdded(newMember, conversation).catch((e) => console.error('broadcastDmMemberAdded', e));
}

// Equivalente a gateway.emitToUser(userId, event, payload) — push genérico a la conexión de sesión de un usuario
export function notifyUser(env: Env, userId: string, event: string, payload: unknown): void {
	const stub = env.USER_REGISTRY_DO.get(env.USER_REGISTRY_DO.idFromName(userId));
	stub.pushEvent(event, payload).catch((e) => console.error('notifyUser', e));
}

// Equivalente a gateway.onlineUsers.has(id) — un RPC por candidato (aceptable a esta escala, igual que el resto de patrones N+1 del plan)
export async function isUserOnline(env: Env, userId: string): Promise<boolean> {
	const stub = env.USER_REGISTRY_DO.get(env.USER_REGISTRY_DO.idFromName(userId));
	try {
		return await stub.isOnline();
	} catch {
		return false;
	}
}

export async function getOnlineFlags(env: Env, userIds: string[]): Promise<Set<string>> {
	const online = new Set<string>();
	await Promise.all(userIds.map(async (id) => {
		if (await isUserOnline(env, id)) online.add(id);
	}));
	return online;
}

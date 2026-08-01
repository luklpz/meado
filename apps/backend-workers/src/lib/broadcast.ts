// Puente REST -> Durable Object. Stub hasta la fase 3: hoy no hay
// ChannelDO/DmDO/UserRegistryDO todavía, así que estas funciones no
// hacen nada. En fase 3 se implementan de verdad vía
// env.CHANNEL_DO.idFromName(channelId).get(id).broadcastX(payload) (RPC).
// Los call sites en routes/{channels,dm}.ts ya están preparados para
// no necesitar cambios cuando esto se implemente.
import type { Env } from '../env.js';

export function broadcastMessageCreated(_env: Env, _channelId: string, _message: unknown): void {}
export function broadcastMessageUpdated(_env: Env, _channelId: string, _message: unknown): void {}
export function broadcastMessageDeleted(_env: Env, _channelId: string, _messageId: string): void {}
export function broadcastReactionUpdated(_env: Env, _channelId: string, _payload: unknown): void {}

export function broadcastDmMessageCreated(_env: Env, _conversationId: string, _message: unknown): void {}
export function broadcastDmMessageUpdated(_env: Env, _conversationId: string, _message: unknown): void {}
export function broadcastDmMessageDeleted(_env: Env, _conversationId: string, _messageId: string): void {}
export function broadcastDmReactionUpdated(_env: Env, _conversationId: string, _payload: unknown): void {}
export function broadcastDmMemberAdded(_env: Env, _conversationId: string, _newMember: unknown, _conversation: unknown): void {}

// Equivalente a gateway.emitToUser(userId, event, payload) — push genérico a un usuario (ej. friend:request)
export function notifyUser(_env: Env, _userId: string, _event: string, _payload: unknown): void {}

// Equivalente a gateway.onlineUsers — hasta la fase 3 (UserRegistryDO) no hay presencia real, todos offline
export function getOnlineUserIds(_env: Env): Set<string> {
	return new Set();
}

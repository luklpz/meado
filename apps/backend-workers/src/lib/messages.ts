import type { PrismaClient } from '../../generated/prisma/client.js';

export const MSG_SELECT = {
	id: true, content: true, createdAt: true, editedAt: true, channelId: true,
	author: { select: { id: true, username: true, name: true, avatarUrl: true } },
	attachments: { select: { id: true, url: true, name: true, size: true, mimeType: true } },
	reactions: { select: { userId: true, emoji: true } },
} as const;

const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢'];

export function formatReactions(raw: { userId: string; emoji: string }[], userId: string) {
	const map = new Map<string, { count: number; me: boolean }>();
	for (const r of raw) {
		const entry = map.get(r.emoji) ?? { count: 0, me: false };
		entry.count++;
		if (r.userId === userId) entry.me = true;
		map.set(r.emoji, entry);
	}
	return Array.from(map.entries()).map(([emoji, { count, me }]) => ({ emoji, count, me }));
}

export async function verifyChannelMember(db: PrismaClient, channelId: string, userId: string): Promise<boolean> {
	const channel = await db.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
	if (!channel) return false;
	const member = await db.serverMember.findUnique({ where: { userId_serverId: { userId, serverId: channel.serverId } } });
	return !!member;
}

/** Crea el mensaje si pasa validación/membership; null si se rechaza (mismo "silencioso" que el gateway original vía WS) */
export async function createChannelMessageChecked(db: PrismaClient, channelId: string, authorId: string, content: string) {
	if (!content?.trim() || content.length > 4000) return null;
	if (!(await verifyChannelMember(db, channelId, authorId))) return null;
	const msg = await db.message.create({ data: { channelId, authorId, content: content.trim() }, select: MSG_SELECT });
	return { ...msg, reactions: [] };
}

export async function toggleChannelReactionChecked(db: PrismaClient, messageId: string, userId: string, emoji: string) {
	if (!ALLOWED_EMOJI.includes(emoji)) return null;
	const msg = await db.message.findUnique({ where: { id: messageId }, select: { channelId: true } });
	if (!msg) return null;
	if (!(await verifyChannelMember(db, msg.channelId, userId))) return null;

	await db.$transaction(async (tx) => {
		const existing = await tx.messageReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
		if (existing) await tx.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
		else await tx.messageReaction.create({ data: { messageId, userId, emoji } });
	});

	const reactions = await db.messageReaction.findMany({ where: { messageId }, select: { userId: true, emoji: true } });
	return { messageId, channelId: msg.channelId, reactions: formatReactions(reactions, userId) };
}

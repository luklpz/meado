import type { PrismaClient } from '../../generated/prisma/client.js';
import { formatReactions } from './messages.js';

export const DM_MSG_SELECT = {
	id: true, content: true, createdAt: true, editedAt: true, conversationId: true,
	author: { select: { id: true, username: true, name: true, avatarUrl: true } },
	attachments: { select: { id: true, url: true, name: true, size: true, mimeType: true } },
	reactions: { select: { userId: true, emoji: true } },
} as const;

const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢'];

export async function isDmMember(db: PrismaClient, conversationId: string, userId: string): Promise<boolean> {
	const m = await db.directConversationMember.findUnique({ where: { userId_conversationId: { userId, conversationId } } });
	return !!m;
}

export async function createDmMessageChecked(db: PrismaClient, conversationId: string, authorId: string, content: string) {
	if (!content?.trim() || content.length > 4000) return null;
	if (!(await isDmMember(db, conversationId, authorId))) return null;
	const msg = await db.directMessage.create({ data: { conversationId, authorId, content: content.trim() }, select: DM_MSG_SELECT });
	await db.directConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
	return { ...msg, reactions: [] };
}

export async function toggleDmReactionChecked(db: PrismaClient, messageId: string, userId: string, emoji: string) {
	if (!ALLOWED_EMOJI.includes(emoji)) return null;
	const msg = await db.directMessage.findUnique({ where: { id: messageId }, select: { conversationId: true } });
	if (!msg) return null;
	if (!(await isDmMember(db, msg.conversationId, userId))) return null;

	await db.$transaction(async (tx) => {
		const existing = await tx.directMessageReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
		if (existing) await tx.directMessageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
		else await tx.directMessageReaction.create({ data: { messageId, userId, emoji } });
	});

	const reactions = await db.directMessageReaction.findMany({ where: { messageId }, select: { userId: true, emoji: true } });
	return { messageId, conversationId: msg.conversationId, reactions: formatReactions(reactions, userId) };
}

export async function getDmMembers(db: PrismaClient, conversationId: string): Promise<string[]> {
	const rows = await db.directConversationMember.findMany({ where: { conversationId }, select: { userId: true } });
	return rows.map((r) => r.userId);
}

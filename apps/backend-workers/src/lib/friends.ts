import type { PrismaClient } from '../../generated/prisma/client.js';

// Compartido con dm.ts (createGroup/addMember solo permiten amigos)
export async function getFriendIds(db: PrismaClient, userId: string): Promise<string[]> {
	const rows = await db.friendship.findMany({
		where: { status: 'ACCEPTED', OR: [{ senderId: userId }, { receiverId: userId }] },
		select: { senderId: true, receiverId: true },
	});
	return rows.map((f) => (f.senderId === userId ? f.receiverId : f.senderId));
}

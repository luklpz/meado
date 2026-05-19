import { writable } from 'svelte/store';

export type ConvMember = { id: string; username: string; name?: string | null; avatarUrl?: string | null };
export type ConvLastMessage = { content: string | null; createdAt: string; author: { username: string; name?: string | null } } | null;

export type Conversation = {
	id: string;
	name: string | null;
	members: ConvMember[];
	lastMessage: ConvLastMessage;
};

function createConversationsStore() {
	const { subscribe, update } = writable<Conversation[]>([]);

	return {
		subscribe,
		seed(convs: Conversation[]) {
			update(current => {
				const serverIds = new Set(convs.map(c => c.id));
				// Keep conversations added dynamically mid-session
				const extras = current.filter(c => !serverIds.has(c.id));
				return [...extras, ...convs];
			});
		},
		add(conv: Conversation) {
			update(current => {
				if (current.some(c => c.id === conv.id)) return current;
				return [conv, ...current];
			});
		},
		updateLastMessage(conversationId: string, lastMessage: ConvLastMessage) {
			update(current => {
				const updated = current.map(c => c.id === conversationId ? { ...c, lastMessage } : c);
				return updated.sort((a, b) => {
					const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
					const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
					return tb - ta;
				});
			});
		},
		addMember(conversationId: string, member: ConvMember) {
			update(current =>
				current.map(c =>
					c.id === conversationId && !c.members.some(m => m.id === member.id)
						? { ...c, members: [...c.members, member] }
						: c
				)
			);
		},
	};
}

export const conversationsStore = createConversationsStore();

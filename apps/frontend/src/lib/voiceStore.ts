import { writable } from 'svelte/store';

export interface ActiveVoice {
	channelId: string;
	channelName: string;
	serverId: string;
	serverSlug: string;
	serverName: string;
}

export const activeVoice = writable<ActiveVoice | null>(null);

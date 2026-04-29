import { writable, get } from 'svelte/store';
import type { Room } from 'livekit-client';

function createLiveKitStore() {
	const micEnabled = writable(false);
	let _room: Room | null = null;

	async function connect(url: string, token: string): Promise<Room> {
		const { Room: LiveKitRoom } = await import('livekit-client');
		const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
		await room.connect(url, token);
		_room = room;
		return room;
	}

	async function enableMic(): Promise<void> {
		if (!_room) return;
		await _room.localParticipant.setMicrophoneEnabled(true);
		micEnabled.set(true);
	}

	async function toggleMic(): Promise<void> {
		if (!_room) return;
		const next = !get(micEnabled);
		await _room.localParticipant.setMicrophoneEnabled(next);
		micEnabled.set(next);
	}

	function disconnect(): void {
		_room?.disconnect();
		_room = null;
		micEnabled.set(false);
	}

	return { micEnabled, connect, enableMic, toggleMic, disconnect };
}

export const livekitStore = createLiveKitStore();

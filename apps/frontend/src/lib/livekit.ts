import { writable, get } from 'svelte/store';
import type { Room } from 'livekit-client';

export type LiveKitStatus = 'idle' | 'connecting' | 'connected' | 'error';

function createLiveKitStore() {
	const micEnabled = writable(false);
	const status = writable<LiveKitStatus>('idle');
	const errorMessage = writable<string>('');
	let _room: Room | null = null;

	async function connect(url: string, token: string): Promise<Room> {
		status.set('connecting');
		const { Room: LiveKitRoom } = await import('livekit-client');
		const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
		await room.connect(url, token);
		_room = room;
		status.set('connected');
		return room;
	}

	async function toggleMic(): Promise<void> {
		if (!_room) {
			errorMessage.set('LiveKit no conectado');
			return;
		}
		const next = !get(micEnabled);
		await _room.localParticipant.setMicrophoneEnabled(next);
		micEnabled.set(next);
	}

	function setError(msg: string): void {
		status.set('error');
		errorMessage.set(msg);
	}

	function disconnect(): void {
		_room?.disconnect();
		_room = null;
		micEnabled.set(false);
		status.set('idle');
		errorMessage.set('');
	}

	return { micEnabled, status, errorMessage, connect, toggleMic, setError, disconnect };
}

export const livekitStore = createLiveKitStore();

import { writable, get } from 'svelte/store';
import type { Room } from 'livekit-client';

export type LiveKitStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface AudioDevice {
	deviceId: string;
	label: string;
}

function createLiveKitStore() {
	const micEnabled = writable(false);
	const status = writable<LiveKitStatus>('idle');
	const errorMessage = writable('');
	const audioLevel = writable(0);
	const micDevices = writable<AudioDevice[]>([]);
	const selectedDeviceId = writable('');

	let _room: Room | null = null;
	let _audioCtx: AudioContext | null = null;
	let _rafId: number | null = null;

	async function connect(url: string, token: string): Promise<Room> {
		status.set('connecting');
		const { Room: LiveKitRoom } = await import('livekit-client');
		const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
		await room.connect(url, token);
		_room = room;
		status.set('connected');
		// Enumerate without permission (labels may be empty until mic is granted)
		await enumerateDevices();
		return room;
	}

	async function enumerateDevices(): Promise<void> {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			const inputs = all
				.filter((d) => d.kind === 'audioinput')
				.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${i + 1}` }));
			micDevices.set(inputs);
			if (inputs.length > 0 && !get(selectedDeviceId)) {
				selectedDeviceId.set(inputs[0].deviceId);
			}
		} catch { /* ignore */ }
	}

	async function toggleMic(): Promise<void> {
		if (!_room) { errorMessage.set('LiveKit no conectado'); return; }
		// Desbloquea reproducción de audio remoto (requiere gesto de usuario)
		await _room.startAudio();

		const next = !get(micEnabled);
		if (next) await _enableMic(); else await _disableMic();
		micEnabled.set(next);
	}

	async function _enableMic(): Promise<void> {
		const deviceId = get(selectedDeviceId);
		const pub = await _room!.localParticipant.setMicrophoneEnabled(
			true,
			deviceId ? { deviceId: { exact: deviceId } } : undefined
		);
		// Re-enumerate with labels now that permission is granted
		await enumerateDevices();
		// VU meter sobre el track publicado (lectura, no afecta lo publicado)
		const mst = (pub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
		if (mst) _startVuMeter(mst);
	}

	async function _disableMic(): Promise<void> {
		_stopVuMeter();
		await _room!.localParticipant.setMicrophoneEnabled(false);
	}

	function _startVuMeter(mst: MediaStreamTrack): void {
		_stopVuMeter();
		_audioCtx = new AudioContext();
		const source = _audioCtx.createMediaStreamSource(new MediaStream([mst]));
		const analyser = _audioCtx.createAnalyser();
		analyser.fftSize = 256;
		const data = new Uint8Array(analyser.frequencyBinCount);
		source.connect(analyser);
		const tick = () => {
			analyser.getByteFrequencyData(data);
			const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
			audioLevel.set(Math.min(1, avg * 4));
			_rafId = requestAnimationFrame(tick);
		};
		_rafId = requestAnimationFrame(tick);
	}

	function _stopVuMeter(): void {
		if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
		_audioCtx?.close();
		_audioCtx = null;
		audioLevel.set(0);
	}

	async function selectDevice(deviceId: string): Promise<void> {
		selectedDeviceId.set(deviceId);
		if (get(micEnabled) && _room) {
			_stopVuMeter();
			await _room.switchActiveDevice('audioinput', deviceId);
			// Re-enganchamos el VU meter al nuevo track
			const { Track } = await import('livekit-client');
			const pub = _room.localParticipant.getTrackPublication(Track.Source.Microphone);
			const mst = (pub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
			if (mst) _startVuMeter(mst);
		}
	}

	function setError(msg: string): void {
		status.set('error');
		errorMessage.set(msg);
	}

	function disconnect(): void {
		_stopVuMeter();
		_room?.disconnect();
		_room = null;
		micEnabled.set(false);
		status.set('idle');
		errorMessage.set('');
	}

	return {
		micEnabled, status, errorMessage, audioLevel, micDevices, selectedDeviceId,
		connect, enumerateDevices, toggleMic, selectDevice, setError, disconnect,
	};
}

export const livekitStore = createLiveKitStore();

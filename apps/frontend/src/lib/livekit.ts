import { writable, get } from 'svelte/store';
import type { Room } from 'livekit-client';

export type LiveKitStatus = 'idle' | 'connecting' | 'connected' | 'error';

function createLiveKitStore() {
	const micEnabled = writable(false);
	const status = writable<LiveKitStatus>('idle');
	const errorMessage = writable('');
	const audioLevel = writable(0); // 0–1, nivel del micro local
	const micGain = writable(1); // 0–3

	let _room: Room | null = null;
	let _audioCtx: AudioContext | null = null;
	let _gainNode: GainNode | null = null;
	let _rawStream: MediaStream | null = null;
	let _rafId: number | null = null;

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

		// Desbloquea la reproducción de audio remoto (requiere gesto del usuario)
		await _room.startAudio();

		const next = !get(micEnabled);
		if (next) {
			await _enableMic();
		} else {
			await _disableMic();
		}
		micEnabled.set(next);
	}

	async function _enableMic(): Promise<void> {
		const { Track } = await import('livekit-client');

		_audioCtx = new AudioContext();
		_rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

		const source = _audioCtx.createMediaStreamSource(_rawStream);
		_gainNode = _audioCtx.createGain();
		_gainNode.gain.value = get(micGain);

		const analyser = _audioCtx.createAnalyser();
		analyser.fftSize = 256;
		const data = new Uint8Array(analyser.frequencyBinCount);

		const dest = _audioCtx.createMediaStreamDestination();
		source.connect(_gainNode);
		_gainNode.connect(dest);
		_gainNode.connect(analyser);

		const tick = () => {
			analyser.getByteFrequencyData(data);
			const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
			audioLevel.set(Math.min(1, avg * 4)); // amplificar para mejor visual
			_rafId = requestAnimationFrame(tick);
		};
		_rafId = requestAnimationFrame(tick);

		await _room!.localParticipant.publishTrack(dest.stream.getAudioTracks()[0], {
			source: Track.Source.Microphone
		});
	}

	async function _disableMic(): Promise<void> {
		if (_rafId) {
			cancelAnimationFrame(_rafId);
			_rafId = null;
		}
		audioLevel.set(0);

		const { Track } = await import('livekit-client');
		const pub = _room!.localParticipant.getTrackPublication(Track.Source.Microphone);
		if (pub?.track) {
			await _room!.localParticipant.unpublishTrack(pub.track.mediaStreamTrack);
		}

		_rawStream?.getTracks().forEach((t) => t.stop());
		_rawStream = null;
		_audioCtx?.close();
		_audioCtx = null;
		_gainNode = null;
	}

	function setGain(value: number): void {
		micGain.set(value);
		if (_gainNode) _gainNode.gain.value = value;
	}

	function setError(msg: string): void {
		status.set('error');
		errorMessage.set(msg);
	}

	function disconnect(): void {
		if (_rafId) cancelAnimationFrame(_rafId);
		_rawStream?.getTracks().forEach((t) => t.stop());
		_audioCtx?.close();
		_room?.disconnect();
		_room = null;
		_audioCtx = null;
		_gainNode = null;
		_rawStream = null;
		_rafId = null;
		micEnabled.set(false);
		audioLevel.set(0);
		status.set('idle');
		errorMessage.set('');
	}

	return {
		micEnabled,
		status,
		errorMessage,
		audioLevel,
		micGain,
		connect,
		toggleMic,
		setGain,
		setError,
		disconnect
	};
}

export const livekitStore = createLiveKitStore();

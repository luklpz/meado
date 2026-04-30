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
	const canPlayAudio = writable(false);
	const diagnostics = writable('');
	const micGain = writable(1);

	let _room: Room | null = null;
	let _audioCtx: AudioContext | null = null;
	let _gainNode: GainNode | null = null;
	let _rawStream: MediaStream | null = null;
	let _rafId: number | null = null;
	let _diagInterval: ReturnType<typeof setInterval> | null = null;
	let _audioEls: HTMLAudioElement[] = [];

	async function connect(url: string, token: string): Promise<Room> {
		status.set('connecting');
		const { Room: LiveKitRoom, RoomEvent, Track } = await import('livekit-client');

		// adaptiveStream pauses tracks on hidden elements — disable it
		const room = new LiveKitRoom({ dynacast: true, adaptiveStream: false });
		await room.connect(url, token);
		_room = room;
		status.set('connected');
		canPlayAudio.set(room.canPlaybackAudio);

		// Attach incoming audio tracks to DOM <audio> elements so they play
		room.on(RoomEvent.TrackSubscribed, (track) => {
			if (track.kind !== Track.Kind.Audio) return;
			const el = track.attach() as HTMLAudioElement;
			el.volume = 0; // proximity system controls volume each frame
			el.style.display = 'none';
			document.body.appendChild(el);
			_audioEls.push(el);
		});

		room.on(RoomEvent.TrackUnsubscribed, (track) => {
			if (track.kind !== Track.Kind.Audio) return;
			const detached = track.detach();
			detached.forEach((el) => el.remove());
			_audioEls = _audioEls.filter((el) => !detached.includes(el));
		});

		const updateDiag = () => {
			let tracks = 0;
			room.remoteParticipants.forEach((p) => {
				p.audioTrackPublications.forEach((pub) => { if (pub.track) tracks++; });
			});
			diagnostics.set(`remote:${room.remoteParticipants.size} audio:${tracks} canPlay:${room.canPlaybackAudio}`);
		};
		room.on(RoomEvent.AudioPlaybackStatusChanged, () => { canPlayAudio.set(room.canPlaybackAudio); updateDiag(); });
		room.on(RoomEvent.ParticipantConnected, updateDiag);
		room.on(RoomEvent.ParticipantDisconnected, updateDiag);
		room.on(RoomEvent.TrackSubscribed, updateDiag);
		room.on(RoomEvent.TrackUnsubscribed, updateDiag);
		_diagInterval = setInterval(updateDiag, 1000);
		updateDiag();

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
			if (inputs.length > 0 && !get(selectedDeviceId)) selectedDeviceId.set(inputs[0].deviceId);
		} catch { /* ignore */ }
	}

	async function startAudio(): Promise<void> {
		if (!_room) return;
		await _room.startAudio();
		canPlayAudio.set(_room.canPlaybackAudio);
		// Unmute any already-attached elements
		_audioEls.forEach((el) => { el.muted = false; });
	}

	async function toggleMic(): Promise<void> {
		if (!_room) { errorMessage.set('LiveKit no conectado'); return; }
		await startAudio();
		const next = !get(micEnabled);
		if (next) await _enableMic(); else await _disableMic();
		micEnabled.set(next);
	}

	async function _enableMic(): Promise<void> {
		const { Track } = await import('livekit-client');
		const deviceId = get(selectedDeviceId);

		_audioCtx = new AudioContext();
		_rawStream = await navigator.mediaDevices.getUserMedia({
			audio: deviceId ? { deviceId: { exact: deviceId } } : true,
			video: false,
		});

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
			audioLevel.set(Math.min(1, avg * 4));
			_rafId = requestAnimationFrame(tick);
		};
		_rafId = requestAnimationFrame(tick);

		await _room!.localParticipant.publishTrack(dest.stream.getAudioTracks()[0], {
			source: Track.Source.Microphone,
		});

		await enumerateDevices();
	}

	async function _disableMic(): Promise<void> {
		if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
		audioLevel.set(0);

		const { Track } = await import('livekit-client');
		const pub = _room!.localParticipant.getTrackPublication(Track.Source.Microphone);
		const mst = (pub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
		if (mst) await _room!.localParticipant.unpublishTrack(mst);

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

	async function selectDevice(deviceId: string): Promise<void> {
		selectedDeviceId.set(deviceId);
		if (get(micEnabled) && _room) {
			await _disableMic();
			await _enableMic();
		}
	}

	function setError(msg: string): void {
		status.set('error');
		errorMessage.set(msg);
	}

	function disconnect(): void {
		if (_rafId) cancelAnimationFrame(_rafId);
		if (_diagInterval) { clearInterval(_diagInterval); _diagInterval = null; }
		_rawStream?.getTracks().forEach((t) => t.stop());
		_audioCtx?.close();
		_audioEls.forEach((el) => el.remove());
		_audioEls = [];
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
		micEnabled, status, errorMessage, audioLevel, micDevices, selectedDeviceId,
		canPlayAudio, diagnostics, micGain,
		connect, enumerateDevices, startAudio, toggleMic, setGain, selectDevice, setError, disconnect,
	};
}

export const livekitStore = createLiveKitStore();

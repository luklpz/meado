import { writable, get } from 'svelte/store';
import type { Room } from 'livekit-client';

export type LiveKitStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type ScreenQuality = 'low' | 'medium' | 'high';

export interface AudioDevice {
	deviceId: string;
	label: string;
}

export interface ScreenShare {
	identity: string;
	username: string;
	track: any;
}

const SCREEN_QUALITY: Record<ScreenQuality, { width: number; height: number; frameRate: number; maxBitrate: number }> = {
	low:    { width: 1280, height: 720,  frameRate: 15, maxBitrate: 1_000_000 },
	medium: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
	high:   { width: 1920, height: 1080, frameRate: 60, maxBitrate: 6_000_000 },
};

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
	const activeSpeakers = writable<string[]>([]);
	const mutedParticipants = writable<Set<string>>(new Set());
	const screenEnabled = writable(false);
	const screenQuality = writable<ScreenQuality>('medium');
	const screenShares = writable<Map<string, ScreenShare>>(new Map());

	let _room: Room | null = null;
	let _audioCtx: AudioContext | null = null;
	let _gainNode: GainNode | null = null;
	let _rawStream: MediaStream | null = null;
	let _screenVideoTrack: MediaStreamTrack | null = null;
	let _screenAudioTrack: MediaStreamTrack | null = null;
	let _rafId: number | null = null;
	let _diagInterval: ReturnType<typeof setInterval> | null = null;
	let _audioEls: HTMLAudioElement[] = [];

	async function connect(url: string, token: string): Promise<Room> {
		status.set('connecting');
		try {
		const { Room: LiveKitRoom, RoomEvent, Track } = await import('livekit-client');

		const room = new LiveKitRoom({ dynacast: true, adaptiveStream: false });
		await room.connect(url, token);
		_room = room;
		status.set('connected');
		canPlayAudio.set(room.canPlaybackAudio);

		room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
			if (track.kind === Track.Kind.Audio) {
				const el = track.attach() as HTMLAudioElement;
				el.volume = 1;
				el.style.display = 'none';
				document.body.appendChild(el);
				_audioEls.push(el);
			} else if (track.source === Track.Source.ScreenShare) {
				const cur = get(screenShares);
				cur.set(participant.identity, {
					identity: participant.identity,
					username: participant.name ?? participant.identity,
					track,
				});
				screenShares.set(new Map(cur));
			}
		});

		room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
			if (track.kind === Track.Kind.Audio) {
				const detached = track.detach();
				detached.forEach((el) => el.remove());
				_audioEls = _audioEls.filter((el) => !detached.includes(el));
			} else if (track.source === Track.Source.ScreenShare) {
				track.detach();
				const cur = get(screenShares);
				cur.delete(participant.identity);
				screenShares.set(new Map(cur));
			}
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
		room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
			activeSpeakers.set(speakers.map((p) => p.identity));
		});

		const updateMuted = () => {
			const muted = new Set<string>();
			room.remoteParticipants.forEach((p) => {
				const hasActiveMic = Array.from(p.audioTrackPublications.values())
					.some((pub) => !pub.isMuted && pub.track !== null);
				if (!hasActiveMic) muted.add(p.identity);
			});
			mutedParticipants.set(muted);
		};
		room.on(RoomEvent.TrackPublished, updateMuted);
		room.on(RoomEvent.TrackUnpublished, updateMuted);
		room.on(RoomEvent.TrackMuted, updateMuted);
		room.on(RoomEvent.TrackUnmuted, updateMuted);
		room.on(RoomEvent.ParticipantConnected, updateMuted);
		room.on(RoomEvent.ParticipantDisconnected, updateMuted);
		room.on(RoomEvent.TrackSubscribed, updateMuted);
		room.on(RoomEvent.TrackUnsubscribed, updateMuted);

		_diagInterval = setInterval(updateDiag, 1000);
		updateDiag();

		await enumerateDevices();
		return room;
		} catch (err) {
			status.set('error');
			errorMessage.set('Error al conectar con el canal de voz');
			throw err;
		}
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
		_audioEls.forEach((el) => { el.muted = false; });
	}

	async function toggleMic(): Promise<void> {
		if (!_room) { errorMessage.set('LiveKit no conectado'); return; }
		errorMessage.set('');
		await startAudio();
		const next = !get(micEnabled);
		try {
			if (next) await _enableMic(); else await _disableMic();
			micEnabled.set(next);
		} catch {
			errorMessage.set('Error al cambiar el micrófono');
			if (next) try { await _disableMic(); } catch { /* already failed */ }
		}
	}

	async function toggleScreen(): Promise<void> {
		if (!_room) return;
		errorMessage.set('');
		const { Track } = await import('livekit-client');

		if (get(screenEnabled)) {
			// Set false BEFORE stopping tracks to prevent the 'ended' listener from re-triggering
			screenEnabled.set(false);
			const pub = _room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
			if (pub?.track) await _room.localParticipant.unpublishTrack((pub.track as any).mediaStreamTrack);
			const audioPub = _room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
			if (audioPub?.track) await _room.localParticipant.unpublishTrack((audioPub.track as any).mediaStreamTrack);
			_screenVideoTrack?.stop(); _screenVideoTrack = null;
			_screenAudioTrack?.stop(); _screenAudioTrack = null;
		} else {
			const q = get(screenQuality);
			const preset = SCREEN_QUALITY[q];
			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getDisplayMedia({
					video: {
						width: { ideal: preset.width },
						height: { ideal: preset.height },
						frameRate: { ideal: preset.frameRate },
					},
					audio: true,
				});
			} catch {
				return; // User cancelled or browser denied — silent
			}

			const videoTrack = stream.getVideoTracks()[0];
			const audioTrack = stream.getAudioTracks()[0];

			_screenVideoTrack = videoTrack;
			_screenAudioTrack = audioTrack ?? null;

			// User clicked browser "Stop sharing" button
			videoTrack.addEventListener('ended', async () => {
				if (get(screenEnabled)) await toggleScreen();
			}, { once: true });

			try {
				await _room.localParticipant.publishTrack(videoTrack, {
					source: Track.Source.ScreenShare,
					simulcast: false,
					videoEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
				});
				if (audioTrack) {
					await _room.localParticipant.publishTrack(audioTrack, {
						source: Track.Source.ScreenShareAudio,
					});
				}
				screenEnabled.set(true);
			} catch {
				videoTrack.stop();
				audioTrack?.stop();
				_screenVideoTrack = null;
				_screenAudioTrack = null;
				errorMessage.set('Error al compartir pantalla');
			}
		}
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
			try {
				await _disableMic();
				await _enableMic();
			} catch {
				micEnabled.set(false);
				errorMessage.set('Error al cambiar el micrófono');
			}
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
		_screenVideoTrack?.stop(); _screenVideoTrack = null;
		_screenAudioTrack?.stop(); _screenAudioTrack = null;
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
		activeSpeakers.set([]);
		mutedParticipants.set(new Set());
		screenEnabled.set(false);
		screenShares.set(new Map());
		status.set('idle');
		errorMessage.set('');
	}

	return {
		micEnabled, status, errorMessage, audioLevel, micDevices, selectedDeviceId,
		canPlayAudio, diagnostics, micGain, activeSpeakers, mutedParticipants,
		screenEnabled, screenQuality, screenShares,
		connect, enumerateDevices, startAudio, toggleMic, toggleScreen,
		setGain, selectDevice, setError, disconnect,
	};
}

export const livekitStore = createLiveKitStore();

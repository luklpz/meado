<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';
	import { authStore } from '$lib/auth.js';

	const CANVAS_W = 800;
	const CANVAS_H = 600;
	// Socket.io: vacío en dev (proxy), URL directa en prod
	const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';
	const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? '';

	interface Props {
		roomSlug: string;
		username: string;
	}
	let { roomSlug, username }: Props = $props();

	let container: HTMLDivElement;
	let game: import('phaser').Game | null = null;

	onMount(async () => {
		// Asegurar que el auth store está inicializado y tenemos socketToken
		let socketToken = authStore.getSocketToken();
		if (!socketToken) {
			await authStore.init();
			socketToken = authStore.getSocketToken();
		}
		if (!socketToken) {
			console.error('No socket token — ¿sesión expirada?');
			return;
		}

		const [Phaser, { createGameScene }] = await Promise.all([
			import('phaser'),
			import('./GameScene.js'),
		]);

		const socketUrl = SOCKET_URL || window.location.origin;
		const socket = (socketStore as any).connect(socketUrl, socketToken);

		let livekitRoom: import('livekit-client').Room | undefined;
		if (LIVEKIT_URL) {
			try {
				const res = await fetch(`/api/rooms/${roomSlug}/livekit-token`, {
					credentials: 'include',
				});
				if (!res.ok) throw new Error(`Token endpoint: ${res.status}`);
				const { token } = await res.json();
				livekitRoom = await livekitStore.connect(LIVEKIT_URL, token);
			} catch (e) {
				livekitStore.setError(e instanceof Error ? e.message : String(e));
				console.error('LiveKit connection failed:', e);
			}
		} else {
			livekitStore.setError('VITE_LIVEKIT_URL no configurada');
		}

		const SceneClass = createGameScene(Phaser, socket, {
			canvasW: CANVAS_W,
			canvasH: CANVAS_H,
			roomId: roomSlug,
			username,
			emitIntervalMs: 50,
			lerpStiffness: 0.001,
			playerSpeed: 200,
			livekitRoom,
			proximityRadius: 500,
		});

		game = new Phaser.Game({
			type: Phaser.AUTO,
			width: CANVAS_W,
			height: CANVAS_H,
			backgroundColor: '#0a1a0f',
			parent: container,
			scene: [SceneClass],
		});
	});

	onDestroy(() => {
		socketStore.disconnect();
		livekitStore.disconnect();
		game?.destroy(true);
	});
</script>

<div bind:this={container} class="game-container"></div>

<style>
	.game-container :global(canvas) {
		display: block;
		border: 1px solid #1a3320;
		border-radius: 4px;
	}
</style>

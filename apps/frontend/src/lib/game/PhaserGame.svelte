<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';

	const CANVAS_W = 800;
	const CANVAS_H = 600;
	const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
	const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? '';
	const ROOM_ID = 'main';
	const USERNAME = `Guest_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

	let container: HTMLDivElement;
	let game: import('phaser').Game | null = null;

	onMount(async () => {
		const [Phaser, { createGameScene }] = await Promise.all([
			import('phaser'),
			import('./GameScene.js')
		]);

		const socket = socketStore.connect(BACKEND_URL);

		let livekitRoom: import('livekit-client').Room | undefined;
		if (LIVEKIT_URL) {
			try {
				const res = await fetch(
					`${BACKEND_URL}/rooms/${ROOM_ID}/livekit-token?username=${USERNAME}`
				);
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
			roomId: ROOM_ID,
			username: USERNAME,
			emitIntervalMs: 50,
			lerpStiffness: 0.001,
			playerSpeed: 200,
			livekitRoom,
			proximityRadius: 200
		});

		game = new Phaser.Game({
			type: Phaser.AUTO,
			width: CANVAS_W,
			height: CANVAS_H,
			backgroundColor: '#0a1a0f',
			parent: container,
			scene: [SceneClass]
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

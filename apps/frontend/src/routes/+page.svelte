<script lang="ts">
	import PhaserGame from '$lib/game/PhaserGame.svelte';
	import { socketStore } from '$lib/socket.js';

	const { connected } = socketStore;
</script>

<svelte:head>
	<title>Meado</title>
</svelte:head>

<div class="page">
	<header class="hud">
		<span class="logo">meado</span>
		<span class="status" class:online={$connected}>
			{$connected ? '● connected' : '○ connecting…'}
		</span>
	</header>

	<main class="canvas-wrap">
		<PhaserGame />
	</main>

	<footer class="controls-hint">
		WASD / ↑↓←→ to move
	</footer>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		min-height: 100vh;
		background: #050d07;
		color: #d1fae5;
		font-family: monospace;
	}

	.hud {
		display: flex;
		width: 800px;
		justify-content: space-between;
		align-items: center;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: #22c55e;
	}

	.status {
		font-size: 0.75rem;
		color: #6b7280;
		transition: color 0.3s;
	}

	.status.online {
		color: #22c55e;
	}

	.controls-hint {
		font-size: 0.7rem;
		color: #374151;
		letter-spacing: 0.1em;
	}
</style>

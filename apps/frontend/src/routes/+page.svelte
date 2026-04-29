<script lang="ts">
	import PhaserGame from '$lib/game/PhaserGame.svelte';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';

	const { connected } = socketStore;
	const { micEnabled, status: livekitStatus, errorMessage, toggleMic } = livekitStore;
</script>

<svelte:head>
	<title>Meado</title>
</svelte:head>

<div class="page">
	<header class="hud">
		<span class="logo">meado</span>
		<div class="hud-right">
			{#if $livekitStatus === 'error'}
				<span class="lk-error" title={$errorMessage}>livekit: error — {$errorMessage}</span>
			{:else if $livekitStatus === 'connecting'}
				<span class="lk-connecting">livekit: connecting…</span>
			{:else if $livekitStatus === 'connected'}
				<button class="mic-btn" class:muted={!$micEnabled} onclick={toggleMic}>
					{$micEnabled ? 'mic on' : 'mic off'}
				</button>
			{:else}
				<span class="lk-connecting">livekit: idle</span>
			{/if}
			<span class="status" class:online={$connected}>
				{$connected ? '● connected' : '○ connecting…'}
			</span>
		</div>
	</header>

	<main class="canvas-wrap">
		<PhaserGame />
	</main>

	<footer class="controls-hint">
		WASD / ↑↓←→ to move · approach others to hear them
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

	.hud-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: #22c55e;
	}

	.mic-btn {
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid #22c55e;
		border-radius: 3px;
		background: transparent;
		color: #22c55e;
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}

	.mic-btn:hover {
		background: #22c55e;
		color: #050d07;
	}

	.mic-btn.muted {
		border-color: #4b5563;
		color: #4b5563;
	}

	.mic-btn.muted:hover {
		background: #4b5563;
		color: #d1fae5;
	}

	.status {
		font-size: 0.75rem;
		color: #6b7280;
		transition: color 0.3s;
	}

	.status.online {
		color: #22c55e;
	}

	.lk-error {
		font-size: 0.7rem;
		color: #ef4444;
	}

	.lk-connecting {
		font-size: 0.7rem;
		color: #6b7280;
	}

	.controls-hint {
		font-size: 0.7rem;
		color: #374151;
		letter-spacing: 0.1em;
	}
</style>

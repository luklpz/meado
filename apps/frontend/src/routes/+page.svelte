<script lang="ts">
	import PhaserGame from '$lib/game/PhaserGame.svelte';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';

	const { connected } = socketStore;
	const { micEnabled, status: livekitStatus, errorMessage, audioLevel, micGain, toggleMic, setGain } =
		livekitStore;
</script>

<svelte:head>
	<title>Meado</title>
</svelte:head>

<div class="page">
	<header class="hud">
		<span class="logo">meado</span>
		<div class="hud-right">
			{#if $livekitStatus === 'error'}
				<span class="lk-error" title={$errorMessage}>livekit: {$errorMessage}</span>
			{:else if $livekitStatus === 'connecting'}
				<span class="lk-dim">livekit: connecting…</span>
			{:else if $livekitStatus === 'connected'}
				<div class="audio-controls">
					{#if $micEnabled}
						<div class="vu-wrap" title="nivel de micrófono">
							<div class="vu-bar" style="width: {Math.round($audioLevel * 100)}%"></div>
						</div>
					{/if}
					<label class="gain-wrap">
						<span class="gain-label">gain {$micGain.toFixed(1)}×</span>
						<input
							type="range"
							min="0"
							max="3"
							step="0.05"
							value={$micGain}
							oninput={(e) => setGain(Number(e.currentTarget.value))}
						/>
					</label>
					<button class="mic-btn" class:muted={!$micEnabled} onclick={toggleMic}>
						{$micEnabled ? 'mic on' : 'mic off'}
					</button>
				</div>
			{:else}
				<span class="lk-dim">livekit: idle</span>
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

	.lk-error {
		font-size: 0.7rem;
		color: #ef4444;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lk-dim {
		font-size: 0.7rem;
		color: #4b5563;
	}

	.audio-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.vu-wrap {
		width: 80px;
		height: 8px;
		background: #1a2e1a;
		border-radius: 4px;
		overflow: hidden;
	}

	.vu-bar {
		height: 100%;
		background: #22c55e;
		border-radius: 4px;
		transition: width 0.05s linear;
		max-width: 100%;
	}

	.gain-wrap {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: default;
	}

	.gain-label {
		font-size: 0.7rem;
		color: #6b7280;
		white-space: nowrap;
		min-width: 5rem;
		text-align: right;
	}

	.gain-wrap input[type='range'] {
		width: 70px;
		accent-color: #22c55e;
		cursor: pointer;
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

	.controls-hint {
		font-size: 0.7rem;
		color: #374151;
		letter-spacing: 0.1em;
	}
</style>

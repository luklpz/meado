<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import PhaserGame from '$lib/game/PhaserGame.svelte';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';
	import { authStore } from '$lib/auth.js';

	let { data } = $props();
	const { user, slug } = data;

	const { connected } = socketStore;
	const { micEnabled, status: livekitStatus, errorMessage, audioLevel, micDevices,
		selectedDeviceId, canPlayAudio, micGain, toggleMic, selectDevice, startAudio, setGain } =
		livekitStore;
</script>

<svelte:head><title>Meado — {slug}</title></svelte:head>

<div class="page">
	<header class="hud">
		<div class="hud-left">
			<a href="/rooms" class="logo">meado</a>
			<span class="room-slug">{slug}</span>
		</div>
		<div class="hud-right">
			{#if $livekitStatus === 'error'}
				<span class="lk-error" title={$errorMessage}>{$errorMessage}</span>
			{/if}

			{#if $livekitStatus === 'connected'}
				<div class="audio-controls">
					{#if $micDevices.length > 1}
						<select
							class="device-select"
							value={$selectedDeviceId}
							onchange={(e) => selectDevice(e.currentTarget.value)}
						>
							{#each $micDevices as dev}
								<option value={dev.deviceId}>{dev.label}</option>
							{/each}
						</select>
					{/if}

					{#if $micEnabled}
						<div class="vu-wrap" title="Nivel de micrófono">
							<div class="vu-bar" style="width: {Math.round($audioLevel * 100)}%"></div>
						</div>
					{/if}

					<input
						type="range"
						class="gain-slider"
						min="0"
						max="3"
						step="0.05"
						title="Ganancia: {$micGain.toFixed(1)}×"
						value={$micGain}
						oninput={(e) => setGain(Number(e.currentTarget.value))}
					/>

					<button class="mic-btn" class:active={$micEnabled} onclick={toggleMic}>
						{$micEnabled ? '🎙 On' : '🎙 Off'}
					</button>
				</div>
			{/if}

			<span class="dot" class:online={$connected} title={$connected ? 'Conectado' : 'Desconectado'}></span>
		</div>
	</header>

	{#if $livekitStatus === 'connected' && !$canPlayAudio}
		<button class="audio-banner" onclick={startAudio}>
			▶ Haz clic aquí para activar el audio.
		</button>
	{/if}

	<main class="canvas-wrap">
		<PhaserGame roomSlug={slug} username={user.username} />
	</main>

	<footer class="controls-hint">
		WASD / ↑↓←→ para moverte · acércate a otros para escucharlos.
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
	}

	.hud {
		display: flex;
		width: 800px;
		justify-content: space-between;
		align-items: center;
	}

	.hud-left { display: flex; align-items: center; gap: 0.75rem; }
	.hud-right { display: flex; align-items: center; gap: 0.75rem; }

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: var(--accent);
		text-decoration: none;
	}

	.logo:hover { text-decoration: none; opacity: 0.85; }

	.room-slug {
		font-size: 0.75rem;
		color: var(--text-muted);
		letter-spacing: 0.05em;
	}

	.lk-error {
		font-size: 0.7rem;
		color: var(--error);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audio-controls { display: flex; align-items: center; gap: 0.5rem; }

	.device-select {
		font-size: 0.7rem;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.22rem 0.4rem;
		cursor: pointer;
		max-width: 140px;
		outline: none;
	}

	.vu-wrap {
		width: 60px;
		height: 6px;
		background: var(--bg-hover);
		border-radius: 3px;
		overflow: hidden;
	}

	.vu-bar {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
		transition: width 0.05s linear;
		max-width: 100%;
	}

	.gain-slider { width: 64px; accent-color: var(--accent); cursor: pointer; }

	.mic-btn {
		font-size: 0.75rem;
		padding: 0.22rem 0.55rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: border-color var(--transition), color var(--transition), background var(--transition);
	}

	.mic-btn.active { border-color: var(--accent); color: var(--accent); }
	.mic-btn:hover { background: var(--bg-hover); }

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-muted);
		transition: background 0.3s;
		flex-shrink: 0;
	}

	.dot.online { background: var(--accent); }

	.audio-banner {
		width: 800px;
		padding: 0.5rem 1rem;
		background: var(--accent-dim);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius);
		color: var(--accent);
		font-size: 0.78rem;
		cursor: pointer;
		text-align: center;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.55; }
	}

	.controls-hint {
		font-size: 0.7rem;
		color: var(--text-muted);
		letter-spacing: 0.08em;
	}
</style>

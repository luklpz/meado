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

	async function handleLogout() {
		await authStore.logout();
		goto('/login');
	}
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
						<div class="vu-wrap" title="nivel de micrófono">
							<div class="vu-bar" style="width: {Math.round($audioLevel * 100)}%"></div>
						</div>
					{/if}

					<input
						type="range"
						class="gain-slider"
						min="0"
						max="3"
						step="0.05"
						title="ganancia: {$micGain.toFixed(1)}x"
						value={$micGain}
						oninput={(e) => setGain(Number(e.currentTarget.value))}
					/>

					<button class="mic-btn" class:active={$micEnabled} onclick={toggleMic}>
						{$micEnabled ? '🎙 on' : '🎙 off'}
					</button>
				</div>
			{/if}

			<span class="username">{user.username}</span>
			<span class="dot" class:online={$connected}></span>
			<button class="btn-ghost" onclick={handleLogout}>salir</button>
		</div>
	</header>

	{#if $livekitStatus === 'connected' && !$canPlayAudio}
		<button class="audio-banner" onclick={startAudio}>
			▶ click aquí para activar el audio
		</button>
	{/if}

	<main class="canvas-wrap">
		<PhaserGame roomSlug={slug} username={user.username} />
	</main>

	<footer class="controls-hint">
		WASD / ↑↓←→ para moverse · acércate a otros para escucharlos
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

	.hud-left { display: flex; align-items: center; gap: 0.75rem; }
	.hud-right { display: flex; align-items: center; gap: 0.75rem; }

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: #22c55e;
		text-decoration: none;
	}

	.room-slug { font-size: 0.75rem; color: #374151; letter-spacing: 0.05em; }

	.username { font-size: 0.75rem; color: #6b7280; }

	.lk-error {
		font-size: 0.7rem;
		color: #ef4444;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audio-controls { display: flex; align-items: center; gap: 0.5rem; }

	.device-select {
		font-family: monospace;
		font-size: 0.7rem;
		background: #0a1a0f;
		color: #d1fae5;
		border: 1px solid #1a3320;
		border-radius: 3px;
		padding: 0.2rem 0.4rem;
		cursor: pointer;
		max-width: 140px;
	}

	.vu-wrap {
		width: 60px;
		height: 6px;
		background: #1a2e1a;
		border-radius: 3px;
		overflow: hidden;
	}

	.vu-bar {
		height: 100%;
		background: #22c55e;
		border-radius: 3px;
		transition: width 0.05s linear;
		max-width: 100%;
	}

	.gain-slider { width: 64px; accent-color: #22c55e; cursor: pointer; }

	.mic-btn {
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid #4b5563;
		border-radius: 3px;
		background: transparent;
		color: #4b5563;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.mic-btn.active { border-color: #22c55e; color: #22c55e; }
	.mic-btn:hover { background: #1a2e1a; }

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #374151;
		transition: background 0.3s;
		flex-shrink: 0;
	}

	.dot.online { background: #22c55e; }

	.btn-ghost {
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: transparent;
		border: 1px solid #374151;
		border-radius: 3px;
		color: #6b7280;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-ghost:hover { border-color: #22c55e; color: #22c55e; }

	.audio-banner {
		width: 800px;
		padding: 0.45rem 1rem;
		background: #1a2e1a;
		border: 1px solid #22c55e;
		border-radius: 4px;
		color: #22c55e;
		font-family: monospace;
		font-size: 0.75rem;
		cursor: pointer;
		text-align: center;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.controls-hint { font-size: 0.7rem; color: #374151; letter-spacing: 0.1em; }
</style>

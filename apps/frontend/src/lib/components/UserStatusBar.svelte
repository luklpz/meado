<script lang="ts">
	import { authStore } from '$lib/auth.js';
	import { micMuted, deafened } from '$lib/voicePrefs.js';
	import { livekitStore } from '$lib/livekit.js';
	import { Mic, MicOff, Headphones, VolumeX } from 'lucide-svelte';

	const { user } = authStore;
	const lkStatus = livekitStore.status;

	const inVoice = $derived($lkStatus === 'connected');

	async function toggleMic() {
		micMuted.update(v => !v);
		if (inVoice) await livekitStore.toggleMic();
	}

	function toggleDeafen() {
		deafened.update(v => {
			const next = !v;
			// mute / unmute all remote audio when deafening
			document.querySelectorAll<HTMLAudioElement>('audio[data-lk]').forEach(el => {
				el.muted = next;
			});
			return next;
		});
	}
</script>

<div class="status-bar">
	<div class="user-identity">
		<div class="sb-avatar">
			{#if $user?.avatarUrl}
				<img src={$user.avatarUrl} alt={$user?.username} />
			{:else if $user}
				<span>{$user.username[0].toUpperCase()}</span>
			{/if}
			{#if inVoice}
				<span class="voice-dot" title="En voz"></span>
			{/if}
		</div>
		<div class="sb-info">
			<span class="sb-name">{$user?.name || $user?.username}</span>
			{#if inVoice}
				<span class="sb-voice-label">En voz</span>
			{:else}
				<span class="sb-tag">@{$user?.username}</span>
			{/if}
		</div>
	</div>

	<div class="sb-controls">
		<button
			class="sb-btn"
			class:active={!$micMuted}
			class:off={$micMuted}
			title={$micMuted ? 'Micro silenciado — click para activar' : 'Silenciar micro'}
			onclick={toggleMic}
		>
			{#if $micMuted}<MicOff size={15} />{:else}<Mic size={15} />{/if}
		</button>

		<button
			class="sb-btn"
			class:active={!$deafened}
			class:off={$deafened}
			title={$deafened ? 'Ensordecido — click para escuchar' : 'Ensordecer'}
			onclick={toggleDeafen}
		>
			{#if $deafened}<VolumeX size={15} />{:else}<Headphones size={15} />{/if}
		</button>
	</div>
</div>

<style>
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.6rem;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.user-identity {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.sb-avatar {
		position: relative;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--accent);
		flex-shrink: 0;
		overflow: visible;
	}

	.sb-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.sb-avatar span:not(.voice-dot) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--bg-surface);
	}

	.voice-dot {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--success);
		border: 2px solid var(--bg-elevated);
	}

	.sb-info {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}

	.sb-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sb-tag, .sb-voice-label {
		font-size: 0.62rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.sb-voice-label { color: var(--success); }

	.sb-controls {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.sb-btn {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
		flex-shrink: 0;
	}

	.sb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-btn.off { color: var(--error); }
	.sb-btn.off:hover { background: var(--error-surface); }
</style>

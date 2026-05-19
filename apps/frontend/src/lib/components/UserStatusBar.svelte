<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeStore, THEME_OPTIONS, type Theme } from '$lib/theme.js';
	import { micMuted, deafened } from '$lib/voicePrefs.js';
	import { livekitStore } from '$lib/livekit.js';
	import {
		Mic, MicOff, Headphones, VolumeX,
		Check, X, LogOut, Pen, Upload, Loader2, ChevronRight,
	} from 'lucide-svelte';

	const { user } = authStore;
	const lkStatus = livekitStore.status;
	const inVoice = $derived($lkStatus === 'connected');

	let open = $state(false);
	let uploading = $state(false);
	let uploadError = $state('');
	let editingName = $state(false);
	let nameInput = $state('');
	let nameError = $state('');
	let fileInput: HTMLInputElement;

	// Theme flyout (fixed-positioned to escape panel overflow)
	let showTheme = $state(false);
	let themeBtnEl: HTMLButtonElement;
	let flyoutTop = $state(0);
	let flyoutLeft = $state(0);

	function openThemeFlyout() {
		const r = themeBtnEl.getBoundingClientRect();
		flyoutTop = r.top;
		flyoutLeft = r.right + 4;
		showTheme = !showTheme;
	}

	function handleWindowClick(e: MouseEvent) {
		const t = e.target as Element;
		if (showTheme && !t.closest('.theme-flyout') && !t.closest('.theme-row')) {
			showTheme = false;
		}
		if (open && !t.closest('.usb-wrap') && !t.closest('.theme-flyout')) {
			open = false;
			showTheme = false;
		}
	}

	async function toggleMic() {
		micMuted.update(v => !v);
		if (inVoice) await livekitStore.toggleMic();
	}

	function toggleDeafen() {
		deafened.update(v => {
			const next = !v;
			document.querySelectorAll<HTMLAudioElement>('audio[data-lk]').forEach(el => {
				el.muted = next;
			});
			return next;
		});
	}

	async function handleLogout() {
		open = false;
		await authStore.logout();
		await invalidateAll();
		goto('/login');
	}

	function setTheme(t: Theme) {
		themeStore.set(t);
		showTheme = false;
	}

	async function saveName() {
		nameError = '';
		try {
			await authStore.updateProfile(nameInput);
			editingName = false;
		} catch (err) {
			nameError = err instanceof Error ? err.message : 'Error';
		}
	}

	async function handleFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadError = '';
		uploading = true;
		try {
			await authStore.updateAvatar(file);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Error al subir la imagen.';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/gif,image/webp"
	style="display:none"
	onchange={handleFileChange}
/>

<!-- Theme flyout (outside usb-wrap to avoid clipping) -->
{#if showTheme}
	<div class="theme-flyout" style="top:{flyoutTop}px; left:{flyoutLeft}px;">
		{#each THEME_OPTIONS as opt}
			<button
				class="flyout-item"
				class:active={$themeStore === opt.value}
				onclick={() => setTheme(opt.value)}
			>
				<span class="flyout-icon">{opt.icon}</span>
				<span>{opt.label}</span>
				{#if $themeStore === opt.value}<Check size={12} class="flyout-check" />{/if}
			</button>
		{/each}
	</div>
{/if}

<div class="usb-wrap">
	{#if open}
		<div class="profile-panel">
			<!-- Banner + avatar -->
			<div class="card-header">
				<div class="banner"></div>
				<div class="header-bottom">
					<button
						class="avatar-wrap"
						onclick={() => fileInput.click()}
						disabled={uploading}
						title="Cambiar foto de perfil"
					>
						{#if $user?.avatarUrl}
							<img src={$user.avatarUrl} alt={$user.username} class="avatar-lg" />
						{:else if $user}
							<span class="avatar-initial-lg">{$user.username[0].toUpperCase()}</span>
						{/if}
						<div class="avatar-overlay">
							{#if uploading}
								<Loader2 size={18} class="spin-icon" />
							{:else}
								<Upload size={16} />
							{/if}
						</div>
					</button>
					{#if $user?.role === 'ADMIN' || $user?.role === 'SUPERADMIN'}
						<span class="role-chip">Admin</span>
					{/if}
				</div>
			</div>

			<!-- Identity -->
			<div class="identity">
				{#if editingName}
					<div class="name-edit-row">
						<input
							class="name-input"
							bind:value={nameInput}
							placeholder="Nombre visible"
							maxlength="64"
							onkeydown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }}
						/>
						<button class="icon-btn-sm ok" onclick={saveName}><Check size={13} /></button>
						<button class="icon-btn-sm" onclick={() => (editingName = false)}><X size={13} /></button>
					</div>
					{#if nameError}<span class="name-error">{nameError}</span>{/if}
				{:else}
					<span class="display-name">{$user?.name || $user?.username}</span>
				{/if}
				<span class="username-tag">@{$user?.username}</span>
			</div>

			{#if uploadError}
				<p class="upload-error">{uploadError}</p>
			{/if}

			<div class="sep"></div>

			<!-- Edit profile -->
			<button class="menu-item" onclick={() => { nameInput = $user?.name ?? ''; editingName = true; }}>
				<span class="menu-item-icon"><Pen size={14} /></span>
				Editar perfil
			</button>

			<!-- Theme (flyout) -->
			<button bind:this={themeBtnEl} class="menu-item theme-row" onclick={openThemeFlyout}>
				<span class="menu-item-icon">{THEME_OPTIONS.find(o => o.value === $themeStore)?.icon ?? '◐'}</span>
				Tema
				<ChevronRight size={13} class="menu-arrow" />
			</button>

			<div class="sep"></div>

			<button class="menu-item danger" onclick={handleLogout}>
				<span class="menu-item-icon"><LogOut size={14} /></span>
				Cerrar sesión
			</button>
		</div>
	{/if}

	<!-- Status bar -->
	<div class="status-bar">
		<button class="user-identity" onclick={() => { open = !open; if (!open) showTheme = false; }} title="Perfil y ajustes">
			<div class="sb-avatar">
				{#if $user?.avatarUrl}
					<img src={$user.avatarUrl} alt={$user?.username} />
				{:else if $user}
					<span class="sb-initial">{$user.username[0].toUpperCase()}</span>
				{/if}
				{#if inVoice}
					<span class="voice-dot" title="En voz"></span>
				{/if}
			</div>
			<div class="sb-info">
				<span class="sb-name">{$user?.name || $user?.username}</span>
				{#if inVoice}
					<span class="sb-sub voice-label">En voz</span>
				{:else}
					<span class="sb-sub">@{$user?.username}</span>
				{/if}
			</div>
		</button>

		<div class="sb-controls">
			<button
				class="sb-btn"
				class:off={$micMuted}
				title={$micMuted ? 'Micro silenciado — click para activar' : 'Silenciar micro'}
				onclick={toggleMic}
			>
				{#if $micMuted}<MicOff size={15} />{:else}<Mic size={15} />{/if}
			</button>

			<button
				class="sb-btn"
				class:off={$deafened}
				title={$deafened ? 'Ensordecido — click para escuchar' : 'Ensordecer'}
				onclick={toggleDeafen}
			>
				{#if $deafened}<VolumeX size={15} />{:else}<Headphones size={15} />{/if}
			</button>
		</div>
	</div>
</div>

<style>
	/* ── Fixed wrapper spanning rail (56px) + sidebar (240px) ── */
	.usb-wrap {
		position: fixed;
		bottom: 0;
		left: 0;
		width: calc(56px + 240px);
		z-index: 9999;
		font-family: var(--font-mono);
	}

	/* ── Profile panel ── */
	.profile-panel {
		position: absolute;
		bottom: 100%;
		left: 56px;
		width: 260px;
		margin-bottom: 4px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
	}

	.card-header { position: relative; }

	.banner {
		height: 64px;
		background: linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%);
		position: relative;
		overflow: hidden;
	}

	.banner::after {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			45deg, transparent, transparent 12px,
			rgba(255,255,255,0.015) 12px, rgba(255,255,255,0.015) 13px
		);
	}

	.header-bottom {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding: 0 0.9rem 0.6rem;
		margin-top: -28px;
	}

	.avatar-wrap {
		position: relative;
		width: 56px; height: 56px;
		border-radius: 50%;
		border: 3px solid var(--bg-surface);
		background: var(--bg-elevated);
		overflow: hidden;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: border-color var(--transition);
	}

	.avatar-wrap:hover { border-color: var(--accent); }
	.avatar-wrap:disabled { cursor: not-allowed; opacity: 0.6; }
	.avatar-lg { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

	.avatar-initial-lg {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1;
	}

	.avatar-overlay {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: rgba(0,0,0,0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		opacity: 0;
		transition: opacity var(--transition);
	}

	.avatar-wrap:hover .avatar-overlay { opacity: 1; }

	:global(.spin-icon) { animation: spin 0.9s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.role-chip {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		color: var(--accent);
		background: var(--accent-dim);
		margin-bottom: 0.2rem;
	}

	.identity {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0 0.9rem 0.75rem;
	}

	.display-name {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.username-tag { font-size: 0.72rem; color: var(--text-muted); }

	.name-edit-row { display: flex; align-items: center; gap: 0.25rem; }

	.name-input {
		font-size: 0.8rem;
		padding: 0.25rem 0.4rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		outline: none;
		flex: 1;
		min-width: 0;
		font-family: inherit;
	}

	.icon-btn-sm {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.15rem 0.2rem;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		transition: background var(--transition), color var(--transition);
		flex-shrink: 0;
	}

	.icon-btn-sm.ok { color: var(--success); }
	.icon-btn-sm.ok:hover { background: var(--success-surface); }
	.icon-btn-sm:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.name-error { font-size: 0.65rem; color: var(--error); }
	.upload-error { font-size: 0.7rem; color: var(--error); padding: 0 0.9rem 0.5rem; }

	.sep { height: 1px; background: var(--border); margin: 0.1rem 0; }

	/* ── Menu items ── */
	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.45rem 0.75rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.82rem;
		color: var(--text-secondary);
		text-align: left;
		transition: background var(--transition), color var(--transition);
		font-family: inherit;
		border-radius: 0;
	}

	.menu-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.menu-item.danger { color: var(--text-secondary); }
	.menu-item.danger:hover { background: var(--error-surface); color: var(--error); }

	.menu-item-icon {
		width: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-size: 0.82rem;
	}

	:global(.menu-arrow) {
		margin-left: auto;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	/* ── Theme flyout ── */
	.theme-flyout {
		position: fixed;
		z-index: 10000;
		width: 180px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 8px 32px rgba(0,0,0,0.45);
		padding: 0.2rem 0;
	}

	.flyout-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.6rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--text-secondary);
		font-family: inherit;
		transition: background var(--transition), color var(--transition);
	}

	.flyout-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.flyout-item.active { color: var(--accent); }
	.flyout-icon { font-size: 0.8rem; width: 16px; flex-shrink: 0; }
	:global(.flyout-check) { margin-left: auto; color: var(--accent); }

	/* ── Status bar ── */
	.status-bar {
		display: flex;
		align-items: center;
		padding: 0 0.4rem;
		height: 52px;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		gap: 0.2rem;
	}

	.user-identity {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		flex: 1;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.3rem 0.35rem;
		border-radius: var(--radius-sm);
		text-align: left;
		transition: background var(--transition);
		color: inherit;
		overflow: hidden;
	}

	.user-identity:hover { background: var(--bg-hover); }

	.sb-avatar {
		position: relative;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: visible;
	}

	.sb-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.sb-initial {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--accent);
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
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
		overflow: hidden;
	}

	.sb-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sb-sub {
		font-size: 0.62rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.sb-sub.voice-label { color: var(--success); }

	.sb-controls {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
	}

	.sb-btn {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
	}

	.sb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-btn.off { color: var(--error); }
	.sb-btn.off:hover { background: var(--error-surface); }
</style>

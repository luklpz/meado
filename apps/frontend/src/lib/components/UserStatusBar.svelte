<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeStore, THEME_OPTIONS, type Theme } from '$lib/theme.js';
	import { micMuted, deafened, userStatus, STATUS_CONFIG, type UserStatus } from '$lib/voicePrefs.js';
	import { livekitStore } from '$lib/livekit.js';
	import {
		Mic, MicOff, Headphones, VolumeX,
		Check, X, LogOut, Pen, Upload, Loader2,
		ChevronRight, ChevronDown, Settings,
	} from 'lucide-svelte';

	const { user } = authStore;
	const lkStatus = livekitStore.status;
	const micDevices = livekitStore.micDevices;
	const selectedDeviceId = livekitStore.selectedDeviceId;
	const micGain = livekitStore.micGain;
	const outputDevices = livekitStore.outputDevices;
	const selectedOutputId = livekitStore.selectedOutputId;
	const outputVolume = livekitStore.outputVolume;

	const inVoice = $derived($lkStatus === 'connected');

	// ── Panel open state ──────────────────────────────────────────────────
	let profileOpen = $state(false);
	let showTheme = $state(false);
	let showMicFlyout = $state(false);
	let showOutFlyout = $state(false);
	let showSettings = $state(false);

	// ── Flyout positions ──────────────────────────────────────────────────
	let themeFlyoutTop = $state(0);
	let themeFlyoutLeft = $state(0);
	let micFlyoutLeft = $state(0);
	let outFlyoutLeft = $state(0);
	let settingsFlyoutLeft = $state(0);

	// ── Element refs ──────────────────────────────────────────────────────
	let themeBtnEl: HTMLButtonElement;
	let micChevronEl: HTMLButtonElement;
	let outChevronEl: HTMLButtonElement;
	let gearBtnEl: HTMLButtonElement;
	let fileInput: HTMLInputElement;

	// ── Profile panel state ───────────────────────────────────────────────
	let uploading = $state(false);
	let uploadError = $state('');
	let editingName = $state(false);
	let nameInput = $state('');
	let nameError = $state('');

	// ── Helpers ───────────────────────────────────────────────────────────
	function clampLeft(left: number, width: number): number {
		return Math.min(Math.max(8, left), window.innerWidth - width - 8);
	}

	function closAll() {
		profileOpen = false;
		showTheme = false;
		showMicFlyout = false;
		showOutFlyout = false;
		showSettings = false;
	}

	function handleWindowClick(e: MouseEvent) {
		const t = e.target as Element;
		if (!t.closest('.usb-wrap') && !t.closest('.usb-flyout')) closAll();
	}

	// ── Profile panel ─────────────────────────────────────────────────────
	async function handleLogout() {
		closAll();
		await authStore.logout();
		await invalidateAll();
		goto('/login');
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

	// ── Theme flyout ──────────────────────────────────────────────────────
	function openTheme() {
		const r = themeBtnEl.getBoundingClientRect();
		const fw = 180;
		const spaceRight = window.innerWidth - r.right;
		themeFlyoutLeft = spaceRight >= fw + 8 ? r.right + 4 : r.left - fw - 4;
		themeFlyoutTop = r.top;
		showTheme = !showTheme;
	}

	function setTheme(t: Theme) { themeStore.set(t); showTheme = false; }

	// ── Mic flyout ────────────────────────────────────────────────────────
	async function openMicFlyout() {
		await livekitStore.enumerateDevices();
		micFlyoutLeft = clampLeft(micChevronEl.getBoundingClientRect().left, 260);
		showMicFlyout = !showMicFlyout;
		showOutFlyout = false;
		showSettings = false;
	}

	// ── Output flyout ─────────────────────────────────────────────────────
	async function openOutFlyout() {
		await livekitStore.enumerateDevices();
		outFlyoutLeft = clampLeft(outChevronEl.getBoundingClientRect().left, 260);
		showOutFlyout = !showOutFlyout;
		showMicFlyout = false;
		showSettings = false;
	}

	// ── Settings flyout ───────────────────────────────────────────────────
	async function openSettings() {
		await livekitStore.enumerateDevices();
		settingsFlyoutLeft = clampLeft(gearBtnEl.getBoundingClientRect().left - 220, 300);
		showSettings = !showSettings;
		showMicFlyout = false;
		showOutFlyout = false;
	}

	// ── Voice controls ────────────────────────────────────────────────────
	async function toggleMic() {
		micMuted.update(v => !v);
		if (inVoice) await livekitStore.toggleMic();
	}

	function toggleDeafen() {
		deafened.update(v => {
			const next = !v;
			document.querySelectorAll<HTMLAudioElement>('audio').forEach(el => { el.muted = next; });
			return next;
		});
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

<!-- ── Theme flyout ─────────────────────────────────────────────────────── -->
{#if showTheme}
	<div class="usb-flyout theme-flyout" style="top:{themeFlyoutTop}px; left:{themeFlyoutLeft}px;">
		{#each THEME_OPTIONS as opt}
			<button class="flyout-item" class:active={$themeStore === opt.value} onclick={() => setTheme(opt.value)}>
				<span class="flyout-icon">{opt.icon}</span>
				<span>{opt.label}</span>
				{#if $themeStore === opt.value}<Check size={12} class="flyout-check" />{/if}
			</button>
		{/each}
	</div>
{/if}

<!-- ── Mic input flyout ──────────────────────────────────────────────────── -->
{#if showMicFlyout}
	<div class="usb-flyout device-flyout" style="bottom:60px; left:{micFlyoutLeft}px;">
		<div class="flyout-section-label">Dispositivo de entrada</div>
		{#if $micDevices.length === 0}
			<p class="flyout-empty">No se detectaron micrófonos</p>
		{:else}
			{#each $micDevices as dev (dev.deviceId)}
				<button
					class="flyout-item"
					class:active={$selectedDeviceId === dev.deviceId}
					onclick={() => livekitStore.selectDevice(dev.deviceId)}
				>
					<span class="flyout-dot"></span>
					<span class="flyout-devname">{dev.label}</span>
					{#if $selectedDeviceId === dev.deviceId}<Check size={12} class="flyout-check" />{/if}
				</button>
			{/each}
		{/if}
		<div class="flyout-sep"></div>
		<div class="flyout-section-label">Volumen de entrada</div>
		<div class="flyout-slider-row">
			<input
				type="range" min="0" max="200" step="1"
				value={Math.round($micGain * 100)}
				oninput={(e) => livekitStore.setGain(+(e.target as HTMLInputElement).value / 100)}
				class="flyout-slider"
			/>
			<span class="flyout-val">{Math.round($micGain * 100)}%</span>
		</div>
	</div>
{/if}

<!-- ── Audio output flyout ───────────────────────────────────────────────── -->
{#if showOutFlyout}
	<div class="usb-flyout device-flyout" style="bottom:60px; left:{outFlyoutLeft}px;">
		<div class="flyout-section-label">Dispositivo de salida</div>
		{#if $outputDevices.length === 0}
			<p class="flyout-empty">No se detectaron altavoces</p>
		{:else}
			{#each $outputDevices as dev (dev.deviceId)}
				<button
					class="flyout-item"
					class:active={$selectedOutputId === dev.deviceId}
					onclick={() => livekitStore.selectOutputDevice(dev.deviceId)}
				>
					<span class="flyout-dot"></span>
					<span class="flyout-devname">{dev.label}</span>
					{#if $selectedOutputId === dev.deviceId}<Check size={12} class="flyout-check" />{/if}
				</button>
			{/each}
		{/if}
		<div class="flyout-sep"></div>
		<div class="flyout-section-label">Volumen de salida</div>
		<div class="flyout-slider-row">
			<input
				type="range" min="0" max="100" step="1"
				value={Math.round($outputVolume * 100)}
				oninput={(e) => livekitStore.setOutputVolume(+(e.target as HTMLInputElement).value / 100)}
				class="flyout-slider"
			/>
			<span class="flyout-val">{Math.round($outputVolume * 100)}%</span>
		</div>
	</div>
{/if}

<!-- ── Voice settings flyout (gear) ─────────────────────────────────────── -->
{#if showSettings}
	<div class="usb-flyout settings-flyout" style="bottom:60px; left:{settingsFlyoutLeft}px;">
		<div class="flyout-title">Ajustes de voz</div>

		<div class="flyout-section-label">Dispositivo de entrada</div>
		{#if $micDevices.length > 0}
			<select class="flyout-select" value={$selectedDeviceId} onchange={(e) => livekitStore.selectDevice((e.target as HTMLSelectElement).value)}>
				{#each $micDevices as dev (dev.deviceId)}
					<option value={dev.deviceId}>{dev.label}</option>
				{/each}
			</select>
		{:else}
			<p class="flyout-empty">No detectados</p>
		{/if}
		<div class="flyout-slider-row">
			<input
				type="range" min="0" max="200" step="1"
				value={Math.round($micGain * 100)}
				oninput={(e) => livekitStore.setGain(+(e.target as HTMLInputElement).value / 100)}
				class="flyout-slider"
			/>
			<span class="flyout-val">{Math.round($micGain * 100)}%</span>
		</div>

		<div class="flyout-sep"></div>

		<div class="flyout-section-label">Dispositivo de salida</div>
		{#if $outputDevices.length > 0}
			<select class="flyout-select" value={$selectedOutputId} onchange={(e) => livekitStore.selectOutputDevice((e.target as HTMLSelectElement).value)}>
				{#each $outputDevices as dev (dev.deviceId)}
					<option value={dev.deviceId}>{dev.label}</option>
				{/each}
			</select>
		{:else}
			<p class="flyout-empty">No detectados</p>
		{/if}
		<div class="flyout-slider-row">
			<input
				type="range" min="0" max="100" step="1"
				value={Math.round($outputVolume * 100)}
				oninput={(e) => livekitStore.setOutputVolume(+(e.target as HTMLInputElement).value / 100)}
				class="flyout-slider"
			/>
			<span class="flyout-val">{Math.round($outputVolume * 100)}%</span>
		</div>
	</div>
{/if}

<!-- ── Main wrapper ──────────────────────────────────────────────────────── -->
<div class="usb-wrap">
	{#if profileOpen}
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
							{#if uploading}<Loader2 size={18} class="spin-icon" />{:else}<Upload size={16} />{/if}
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

			{#if uploadError}<p class="upload-error">{uploadError}</p>{/if}

			<div class="sep"></div>

			<!-- Status picker -->
			{#each Object.entries(STATUS_CONFIG) as [key, cfg]}
				<button
					class="menu-item status-item"
					class:status-active={$userStatus === key}
					onclick={() => userStatus.set(key as UserStatus)}
				>
					<span class="status-bullet" style="background:{cfg.color}"></span>
					<span class="status-texts">
						<span class="status-label">{cfg.label}</span>
						{#if cfg.description}<span class="status-desc">{cfg.description}</span>{/if}
					</span>
					{#if $userStatus === key}<Check size={12} class="status-check" />{/if}
				</button>
			{/each}

			<div class="sep"></div>

			<!-- Edit profile -->
			<button class="menu-item" onclick={() => { nameInput = $user?.name ?? ''; editingName = true; }}>
				<span class="menu-item-icon"><Pen size={14} /></span>
				Editar perfil
			</button>

			<!-- Theme flyout trigger -->
			<button bind:this={themeBtnEl} class="menu-item theme-row" onclick={openTheme}>
				<span class="menu-item-icon">{THEME_OPTIONS.find(o => o.value === $themeStore)?.icon ?? '◐'}</span>
				Tema — {THEME_OPTIONS.find(o => o.value === $themeStore)?.label}
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
		<!-- Identity (clickable → profile panel) -->
		<button
			class="user-identity"
			onclick={() => { profileOpen = !profileOpen; showTheme = false; }}
			title="Perfil y ajustes"
		>
			<div class="sb-avatar">
				{#if $user?.avatarUrl}
					<img src={$user.avatarUrl} alt={$user?.username} />
				{:else if $user}
					<span class="sb-initial">{$user.username[0].toUpperCase()}</span>
				{/if}
				<!-- Voice dot overrides status dot -->
				{#if inVoice}
					<span class="status-indicator" style="background:#23a559" title="En voz"></span>
				{:else}
					<span class="status-indicator" style="background:{STATUS_CONFIG[$userStatus].color}" title={STATUS_CONFIG[$userStatus].label}></span>
				{/if}
			</div>
			<div class="sb-info">
				<span class="sb-name">{$user?.name || $user?.username}</span>
				{#if inVoice}
					<span class="sb-sub voice-label">En voz</span>
				{:else}
					<span class="sb-sub" style="color:{STATUS_CONFIG[$userStatus].color}">{STATUS_CONFIG[$userStatus].label}</span>
				{/if}
			</div>
		</button>

		<!-- Controls -->
		<div class="sb-controls">
			<!-- Mic group -->
			<div class="ctrl-group">
				<button
					class="sb-btn"
					class:off={$micMuted}
					title={$micMuted ? 'Micro silenciado — click para activar' : 'Silenciar micro'}
					onclick={toggleMic}
				>
					{#if $micMuted}<MicOff size={15} />{:else}<Mic size={15} />{/if}
				</button>
				<button
					bind:this={micChevronEl}
					class="sb-chevron"
					title="Opciones de entrada"
					onclick={openMicFlyout}
					class:active={showMicFlyout}
				>
					<ChevronDown size={10} />
				</button>
			</div>

			<!-- Headphone group -->
			<div class="ctrl-group">
				<button
					class="sb-btn"
					class:off={$deafened}
					title={$deafened ? 'Ensordecido — click para escuchar' : 'Ensordecer'}
					onclick={toggleDeafen}
				>
					{#if $deafened}<VolumeX size={15} />{:else}<Headphones size={15} />{/if}
				</button>
				<button
					bind:this={outChevronEl}
					class="sb-chevron"
					title="Opciones de salida"
					onclick={openOutFlyout}
					class:active={showOutFlyout}
				>
					<ChevronDown size={10} />
				</button>
			</div>

			<!-- Settings gear -->
			<button
				bind:this={gearBtnEl}
				class="sb-btn"
				class:active={showSettings}
				title="Ajustes de voz"
				onclick={openSettings}
			>
				<Settings size={15} />
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

	/* ── Profile panel (opens upward from bar) ── */
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

	/* ── Generic flyout base ── */
	:global(.usb-flyout) {
		position: fixed;
		z-index: 10000;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0,0,0,0.45);
		overflow: hidden;
		font-family: var(--font-mono);
	}

	:global(.theme-flyout) { width: 180px; padding: 0.2rem 0; }
	:global(.device-flyout) { width: 260px; padding: 0.5rem 0; }
	:global(.settings-flyout) { width: 300px; padding: 0.5rem 0; }

	.flyout-title {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--text-primary);
		padding: 0.4rem 0.75rem 0.2rem;
	}

	.flyout-section-label {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--text-muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.4rem 0.75rem 0.2rem;
	}

	.flyout-sep { height: 1px; background: var(--border); margin: 0.3rem 0; }

	.flyout-empty {
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 0.25rem 0.75rem;
	}

	:global(.flyout-item) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.6rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		transition: background var(--transition), color var(--transition);
		text-align: left;
	}

	:global(.flyout-item:hover) { background: var(--bg-elevated); color: var(--text-primary); }
	:global(.flyout-item.active) { color: var(--accent); }
	:global(.flyout-icon) { font-size: 0.8rem; width: 16px; flex-shrink: 0; }
	:global(.flyout-devname) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	:global(.flyout-dot) { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
	:global(.flyout-check) { margin-left: auto; color: var(--accent); flex-shrink: 0; }
	:global(.flyout-check-inline) { color: var(--accent); }

	.flyout-slider-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.75rem 0.5rem;
	}

	.flyout-slider {
		flex: 1;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.flyout-val {
		font-size: 0.65rem;
		color: var(--text-muted);
		min-width: 32px;
		text-align: right;
	}

	.flyout-select {
		width: calc(100% - 1.5rem);
		margin: 0 0.75rem 0.35rem;
		font-size: 0.75rem;
		padding: 0.3rem 0.4rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-family: var(--font-mono);
		outline: none;
		cursor: pointer;
	}

	/* ── Banner + avatar ── */
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

	.avatar-initial-lg { font-size: 1.4rem; font-weight: 700; color: var(--accent); line-height: 1; }

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
		font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em;
		text-transform: uppercase; padding: 0.15rem 0.45rem; border-radius: 999px;
		border: 1px solid var(--accent); color: var(--accent); background: var(--accent-dim);
		margin-bottom: 0.2rem;
	}

	/* ── Identity section ── */
	.identity { display: flex; flex-direction: column; gap: 0.1rem; padding: 0 0.9rem 0.75rem; }

	.display-name { font-size: 0.92rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
	.username-tag { font-size: 0.72rem; color: var(--text-muted); }
	.name-edit-row { display: flex; align-items: center; gap: 0.25rem; }

	.name-input {
		font-size: 0.8rem; padding: 0.25rem 0.4rem;
		background: var(--bg-elevated); border: 1px solid var(--border-focus);
		border-radius: var(--radius-sm); color: var(--text-primary);
		outline: none; flex: 1; min-width: 0; font-family: inherit;
	}

	.icon-btn-sm {
		background: transparent; border: none; cursor: pointer;
		padding: 0.15rem 0.2rem; border-radius: var(--radius-sm);
		color: var(--text-muted); display: flex; align-items: center;
		transition: background var(--transition), color var(--transition); flex-shrink: 0;
	}

	.icon-btn-sm.ok { color: var(--success); }
	.icon-btn-sm.ok:hover { background: var(--success-surface); }
	.icon-btn-sm:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.name-error { font-size: 0.65rem; color: var(--error); }
	.upload-error { font-size: 0.7rem; color: var(--error); padding: 0 0.9rem 0.5rem; }

	.sep { height: 1px; background: var(--border); margin: 0.1rem 0; }

	/* ── Status picker ── */
	.status-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-family: inherit;
		transition: background var(--transition);
	}

	.status-item:hover { background: var(--bg-elevated); }
	.status-item.status-active { background: var(--bg-elevated); }

	.status-bullet {
		width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
	}

	.status-texts { display: flex; flex-direction: column; flex: 1; min-width: 0; }
	.status-label { font-size: 0.82rem; color: var(--text-primary); }
	.status-desc { font-size: 0.65rem; color: var(--text-muted); }
	:global(.status-check) { color: var(--accent); flex-shrink: 0; }

	/* ── Menu items ── */
	.menu-item {
		display: flex; align-items: center; gap: 0.5rem; width: 100%;
		padding: 0.4rem 0.75rem; border: none; background: transparent;
		cursor: pointer; font-size: 0.82rem; color: var(--text-secondary);
		text-align: left; transition: background var(--transition), color var(--transition);
		font-family: inherit;
	}

	.menu-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.menu-item.danger { color: var(--text-secondary); }
	.menu-item.danger:hover { background: var(--error-surface); color: var(--error); }
	.menu-item-icon { width: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.82rem; }
	:global(.menu-arrow) { margin-left: auto; color: var(--text-muted); flex-shrink: 0; }

	/* ── Status bar ── */
	.status-bar {
		display: flex;
		align-items: center;
		padding: 0 0.4rem;
		height: 52px;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		gap: 0.1rem;
	}

	.user-identity {
		display: flex; align-items: center; gap: 0.45rem; min-width: 0; flex: 1;
		background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.35rem;
		border-radius: var(--radius-sm); text-align: left; transition: background var(--transition);
		color: inherit; overflow: hidden;
	}

	.user-identity:hover { background: var(--bg-hover); }

	.sb-avatar {
		position: relative; width: 32px; height: 32px; border-radius: 50%;
		background: var(--bg-surface); border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0; overflow: visible;
	}

	.sb-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

	.sb-initial {
		font-size: 0.82rem; font-weight: 700; color: var(--accent);
		width: 100%; height: 100%; display: flex; align-items: center;
		justify-content: center; border-radius: 50%;
	}

	.status-indicator {
		position: absolute; bottom: -1px; right: -1px;
		width: 10px; height: 10px; border-radius: 50%;
		border: 2px solid var(--bg-elevated);
	}

	.sb-info { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; overflow: hidden; }

	.sb-name {
		font-size: 0.78rem; font-weight: 600; color: var(--text-primary);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}

	.sb-sub { font-size: 0.62rem; color: var(--text-muted); white-space: nowrap; }
	.sb-sub.voice-label { color: var(--success); }

	/* ── Controls ── */
	.sb-controls { display: flex; align-items: center; gap: 0.15rem; flex-shrink: 0; }

	.ctrl-group { display: flex; align-items: center; }

	.sb-btn {
		width: 28px; height: 28px;
		border-radius: var(--radius-sm); border: none; background: transparent;
		cursor: pointer; display: flex; align-items: center; justify-content: center;
		color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
	}

	.sb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-btn.off { color: var(--error); }
	.sb-btn.off:hover { background: var(--error-surface); }
	.sb-btn.active { color: var(--accent); background: var(--accent-dim); }

	.sb-chevron {
		width: 16px; height: 28px;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border: none; background: transparent; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		color: var(--text-muted);
		transition: background var(--transition), color var(--transition);
		margin-right: 2px;
	}

	.sb-chevron:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-chevron.active { color: var(--accent); background: var(--accent-dim); }
</style>

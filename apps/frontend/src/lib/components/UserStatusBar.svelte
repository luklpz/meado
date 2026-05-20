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

	// ── Panel / flyout state ──────────────────────────────────────────────
	let profileOpen = $state(false);
	let showTheme = $state(false);
	let showStatus = $state(false);
	let showMicFlyout = $state(false);
	let showOutFlyout = $state(false);
	let showSettingsModal = $state(false);
	let settingsTab = $state<'account' | 'voice' | 'appearance'>('account');

	// ── Flyout positions ──────────────────────────────────────────────────
	let themeFlyoutTop = $state(0);
	let themeFlyoutLeft = $state(0);
	let statusFlyoutTop = $state(0);
	let statusFlyoutLeft = $state(0);
	let micFlyoutLeft = $state(0);
	let outFlyoutLeft = $state(0);

	// ── Element refs ──────────────────────────────────────────────────────
	let themeBtnEl = $state<HTMLButtonElement>();
	let statusBtnEl = $state<HTMLButtonElement>();
	let micChevronEl = $state<HTMLButtonElement | null>(null);
	let outChevronEl = $state<HTMLButtonElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let settingsFileInput = $state<HTMLInputElement | null>(null);

	// ── Profile panel state ───────────────────────────────────────────────
	let uploading = $state(false);
	let uploadError = $state('');
	let editingName = $state(false);
	let nameInput = $state('');
	let nameError = $state('');
	let settingsEditingName = $state(false);
	let settingsNameInput = $state('');
	let settingsNameError = $state('');
	let settingsUploading = $state(false);
	let settingsUploadError = $state('');

	// ── Position helpers ──────────────────────────────────────────────────
	function clampLeft(left: number, width: number): number {
		return Math.min(Math.max(8, left), window.innerWidth - width - 8);
	}

	function flyoutPos(btnEl: HTMLElement, fw: number, fh: number): { top: number; left: number } {
		const r = btnEl.getBoundingClientRect();
		const spaceRight = window.innerWidth - r.right;
		const left = spaceRight >= fw + 8 ? r.right + 4 : Math.max(8, r.left - fw - 4);
		const top = Math.min(r.top, window.innerHeight - fh - 8);
		return { top, left };
	}

	// ── Global close ─────────────────────────────────────────────────────
	function closePopups() {
		profileOpen = false;
		showTheme = false;
		showStatus = false;
		showMicFlyout = false;
		showOutFlyout = false;
	}

	function handleWindowClick(e: MouseEvent) {
		const t = e.target as Element;
		if (!t.closest('.usb-wrap') && !t.closest('.usb-flyout') && !t.closest('.settings-overlay')) {
			closePopups();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showSettingsModal) { showSettingsModal = false; return; }
			closePopups();
		}
	}

	// ── Theme flyout ──────────────────────────────────────────────────────
	function openTheme() {
		const fh = THEME_OPTIONS.length * 36 + 16;
		const pos = flyoutPos(themeBtnEl!, 180, fh);
		themeFlyoutTop = pos.top;
		themeFlyoutLeft = pos.left;
		showTheme = !showTheme;
		showStatus = false;
	}

	function setTheme(t: Theme) { themeStore.set(t); showTheme = false; }

	// ── Status flyout ─────────────────────────────────────────────────────
	function openStatus() {
		const fh = Object.keys(STATUS_CONFIG).length * 52 + 16;
		const pos = flyoutPos(statusBtnEl!, 230, fh);
		statusFlyoutTop = pos.top;
		statusFlyoutLeft = pos.left;
		showStatus = !showStatus;
		showTheme = false;
	}

	// ── Audio permission helper ───────────────────────────────────────────
	async function requestAudioPerm() {
		try {
			const s = await navigator.mediaDevices.getUserMedia({ audio: true });
			s.getTracks().forEach(t => t.stop());
		} catch { /* user denied or unavailable */ }
	}

	// ── Mic flyout ────────────────────────────────────────────────────────
	async function openMicFlyout() {
		await requestAudioPerm();
		await livekitStore.enumerateDevices();
		micFlyoutLeft = clampLeft(micChevronEl?.getBoundingClientRect().left ?? 0, 260);
		showMicFlyout = !showMicFlyout;
		showOutFlyout = false;
	}

	// ── Output flyout ─────────────────────────────────────────────────────
	async function openOutFlyout() {
		await livekitStore.enumerateDevices();
		outFlyoutLeft = clampLeft(outChevronEl?.getBoundingClientRect().left ?? 0, 260);
		showOutFlyout = !showOutFlyout;
		showMicFlyout = false;
	}

	// ── Settings modal ────────────────────────────────────────────────────
	async function openSettingsModal(tab: typeof settingsTab = 'account') {
		settingsTab = tab;
		showSettingsModal = true;
		closePopups();
		if (tab === 'voice') await loadVoiceDevices();
	}

	async function loadVoiceDevices() {
		await requestAudioPerm();
		await livekitStore.enumerateDevices();
	}

	// ── Profile panel upload/edit ─────────────────────────────────────────
	async function handleFileChange(e: Event, isSettings = false) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (isSettings) {
			settingsUploadError = '';
			settingsUploading = true;
		} else {
			uploadError = '';
			uploading = true;
		}
		try {
			await authStore.updateAvatar(file);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error al subir la imagen.';
			if (isSettings) settingsUploadError = msg; else uploadError = msg;
		} finally {
			if (isSettings) { settingsUploading = false; if (settingsFileInput) settingsFileInput.value = ''; }
			else { uploading = false; if (fileInput) fileInput.value = ''; }
		}
	}

	async function saveName(isSettings = false) {
		const val = isSettings ? settingsNameInput : nameInput;
		if (isSettings) settingsNameError = ''; else nameError = '';
		try {
			await authStore.updateProfile(val);
			if (isSettings) settingsEditingName = false; else editingName = false;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error';
			if (isSettings) settingsNameError = msg; else nameError = msg;
		}
	}

	async function handleLogout() {
		showSettingsModal = false;
		closePopups();
		await authStore.logout();
		await invalidateAll();
		goto('/login');
	}

	// ── Mic / deafen toggles ──────────────────────────────────────────────
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

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<input bind:this={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange={(e) => handleFileChange(e, false)} />
<input bind:this={settingsFileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange={(e) => handleFileChange(e, true)} />

<!-- ── Theme flyout ─────────────────────────────────────────────────────── -->
{#if showTheme}
	<div class="usb-flyout theme-flyout" style="top:{themeFlyoutTop}px; left:{themeFlyoutLeft}px;">
		{#each THEME_OPTIONS as opt}
			<button class="flyout-item" class:active={$themeStore === opt.value} onclick={() => setTheme(opt.value)}>
				<span class="flyout-icon">{opt.icon}</span>
				<span>{opt.label}</span>
				{#if $themeStore === opt.value}<Check size={12} class="fl-check" />{/if}
			</button>
		{/each}
	</div>
{/if}

<!-- ── Status flyout ────────────────────────────────────────────────────── -->
{#if showStatus}
	<div class="usb-flyout status-flyout" style="top:{statusFlyoutTop}px; left:{statusFlyoutLeft}px;">
		{#each Object.entries(STATUS_CONFIG) as [key, cfg]}
			<button
				class="flyout-item status-flyout-item"
				class:active={$userStatus === key}
				onclick={() => { userStatus.set(key as UserStatus); showStatus = false; }}
			>
				<span class="status-bullet" style="background:{cfg.color}"></span>
				<span class="status-texts">
					<span class="status-label">{cfg.label}</span>
					{#if cfg.description}<span class="status-desc">{cfg.description}</span>{/if}
				</span>
				{#if $userStatus === key}<Check size={12} class="fl-check" />{/if}
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
				<button class="flyout-item" class:active={$selectedDeviceId === dev.deviceId} onclick={() => livekitStore.selectDevice(dev.deviceId)}>
					<span class="flyout-devdot"></span>
					<span class="flyout-devname">{dev.label}</span>
					{#if $selectedDeviceId === dev.deviceId}<Check size={12} class="fl-check" />{/if}
				</button>
			{/each}
		{/if}
		<div class="flyout-sep"></div>
		<div class="flyout-section-label">Volumen de entrada</div>
		<div class="flyout-slider-row">
			<input type="range" min="0" max="200" step="1" value={Math.round($micGain * 100)} oninput={(e) => livekitStore.setGain(+(e.target as HTMLInputElement).value / 100)} class="flyout-slider" />
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
				<button class="flyout-item" class:active={$selectedOutputId === dev.deviceId} onclick={() => livekitStore.selectOutputDevice(dev.deviceId)}>
					<span class="flyout-devdot"></span>
					<span class="flyout-devname">{dev.label}</span>
					{#if $selectedOutputId === dev.deviceId}<Check size={12} class="fl-check" />{/if}
				</button>
			{/each}
		{/if}
		<div class="flyout-sep"></div>
		<div class="flyout-section-label">Volumen de salida</div>
		<div class="flyout-slider-row">
			<input type="range" min="0" max="100" step="1" value={Math.round($outputVolume * 100)} oninput={(e) => livekitStore.setOutputVolume(+(e.target as HTMLInputElement).value / 100)} class="flyout-slider" />
			<span class="flyout-val">{Math.round($outputVolume * 100)}%</span>
		</div>
	</div>
{/if}

<!-- ── Settings modal ────────────────────────────────────────────────────── -->
{#if showSettingsModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="settings-overlay" onclick={(e) => { if (e.target === e.currentTarget) showSettingsModal = false; }} onkeydown={() => {}}>
		<div class="settings-modal">
			<!-- Sidebar nav -->
			<nav class="settings-nav">
				<div class="settings-nav-group-label">Usuario</div>
				<button class="settings-nav-item" class:active={settingsTab === 'account'} onclick={() => (settingsTab = 'account')}>Mi cuenta</button>
				<button class="settings-nav-item" class:active={settingsTab === 'voice'} onclick={async () => { settingsTab = 'voice'; await loadVoiceDevices(); }}>Voz y audio</button>
				<button class="settings-nav-item" class:active={settingsTab === 'appearance'} onclick={() => (settingsTab = 'appearance')}>Apariencia</button>
				<div class="settings-nav-sep"></div>
				<button class="settings-nav-item danger" onclick={handleLogout}><LogOut size={13} /> Cerrar sesión</button>
			</nav>

			<!-- Content -->
			<div class="settings-body">
				<div class="settings-title-row">
					<h2 class="settings-title">
						{#if settingsTab === 'account'}Mi cuenta{:else if settingsTab === 'voice'}Voz y audio{:else}Apariencia{/if}
					</h2>
					<button class="settings-close" onclick={() => (showSettingsModal = false)}><X size={18} /></button>
				</div>

				{#if settingsTab === 'account'}
					<!-- Avatar -->
					<div class="settings-section">
						<div class="settings-label">Foto de perfil</div>
						<div class="settings-avatar-row">
							<button class="settings-avatar-btn" onclick={() => settingsFileInput?.click()} disabled={settingsUploading} title="Cambiar avatar">
								{#if $user?.avatarUrl}
									<img src={$user.avatarUrl} alt={$user.username} class="settings-avatar-img" />
								{:else if $user}
									<span class="settings-avatar-initial">{$user.username[0].toUpperCase()}</span>
								{/if}
								<div class="settings-avatar-overlay">
									{#if settingsUploading}<Loader2 size={20} class="spin-icon" />{:else}<Upload size={18} />{/if}
								</div>
							</button>
							<div class="settings-avatar-info">
								<span class="settings-username">{$user?.name || $user?.username}</span>
								<span class="settings-usertag">@{$user?.username}</span>
								{#if $user?.role === 'ADMIN' || $user?.role === 'SUPERADMIN'}
									<span class="role-chip">Admin</span>
								{/if}
							</div>
						</div>
						{#if settingsUploadError}<p class="settings-error">{settingsUploadError}</p>{/if}
					</div>

					<!-- Display name -->
					<div class="settings-section">
						<div class="settings-label">Nombre visible</div>
						{#if settingsEditingName}
							<div class="settings-edit-row">
								<input class="settings-input" bind:value={settingsNameInput} placeholder="Nombre visible" maxlength="64" onkeydown={e => { if (e.key === 'Enter') saveName(true); if (e.key === 'Escape') settingsEditingName = false; }} />
								<button class="icon-btn-sm ok" onclick={() => saveName(true)}><Check size={13} /></button>
								<button class="icon-btn-sm" onclick={() => (settingsEditingName = false)}><X size={13} /></button>
							</div>
							{#if settingsNameError}<p class="settings-error">{settingsNameError}</p>{/if}
						{:else}
							<button class="settings-field-btn" onclick={() => { settingsNameInput = $user?.name ?? ''; settingsEditingName = true; }}>
								<span>{$user?.name || $user?.username}</span>
								<Pen size={13} class="field-edit-icon" />
							</button>
						{/if}
					</div>

					<!-- Status -->
					<div class="settings-section">
						<div class="settings-label">Estado</div>
						<div class="settings-status-grid">
							{#each Object.entries(STATUS_CONFIG) as [key, cfg]}
								<button
									class="settings-status-btn"
									class:active={$userStatus === key}
									onclick={() => userStatus.set(key as UserStatus)}
								>
									<span class="status-bullet" style="background:{cfg.color}"></span>
									<span class="settings-status-texts">
										<span class="status-label">{cfg.label}</span>
										{#if cfg.description}<span class="status-desc">{cfg.description}</span>{/if}
									</span>
									{#if $userStatus === key}<Check size={12} class="fl-check" />{/if}
								</button>
							{/each}
						</div>
					</div>

				{:else if settingsTab === 'voice'}
					<div class="settings-section">
						<div class="settings-label">Dispositivo de entrada</div>
						{#if $micDevices.length === 0}
							<p class="flyout-empty">No se detectaron micrófonos — acepta el permiso cuando se solicite</p>
						{:else}
							<select class="settings-select" value={$selectedDeviceId} onchange={(e) => livekitStore.selectDevice((e.target as HTMLSelectElement).value)}>
								{#each $micDevices as dev (dev.deviceId)}
									<option value={dev.deviceId}>{dev.label}</option>
								{/each}
							</select>
						{/if}
						<div class="settings-label" style="margin-top:0.75rem">Volumen de entrada</div>
						<div class="flyout-slider-row">
							<input type="range" min="0" max="200" step="1" value={Math.round($micGain * 100)} oninput={(e) => livekitStore.setGain(+(e.target as HTMLInputElement).value / 100)} class="flyout-slider" />
							<span class="flyout-val">{Math.round($micGain * 100)}%</span>
						</div>
					</div>

					<div class="settings-sep"></div>

					<div class="settings-section">
						<div class="settings-label">Dispositivo de salida</div>
						{#if $outputDevices.length === 0}
							<p class="flyout-empty">No se detectaron altavoces</p>
						{:else}
							<select class="settings-select" value={$selectedOutputId} onchange={(e) => livekitStore.selectOutputDevice((e.target as HTMLSelectElement).value)}>
								{#each $outputDevices as dev (dev.deviceId)}
									<option value={dev.deviceId}>{dev.label}</option>
								{/each}
							</select>
						{/if}
						<div class="settings-label" style="margin-top:0.75rem">Volumen de salida</div>
						<div class="flyout-slider-row">
							<input type="range" min="0" max="100" step="1" value={Math.round($outputVolume * 100)} oninput={(e) => livekitStore.setOutputVolume(+(e.target as HTMLInputElement).value / 100)} class="flyout-slider" />
							<span class="flyout-val">{Math.round($outputVolume * 100)}%</span>
						</div>
					</div>

				{:else}
					<div class="settings-section">
						<div class="settings-label">Tema de la aplicación</div>
						<div class="settings-theme-list">
							{#each THEME_OPTIONS as opt}
								<button class="settings-theme-btn" class:active={$themeStore === opt.value} onclick={() => themeStore.set(opt.value)}>
									<span class="flyout-icon">{opt.icon}</span>
									<span>{opt.label}</span>
									{#if $themeStore === opt.value}<Check size={13} class="fl-check" />{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
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
					<button class="avatar-wrap" onclick={() => fileInput?.click()} disabled={uploading} title="Cambiar foto de perfil">
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
						<input class="name-input" bind:value={nameInput} placeholder="Nombre visible" maxlength="64" onkeydown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }} />
						<button class="icon-btn-sm ok" onclick={() => saveName()}><Check size={13} /></button>
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

			<!-- Estado (flyout) -->
			<button bind:this={statusBtnEl} class="menu-item" onclick={openStatus}>
				<span class="status-bullet-sm" style="background:{STATUS_CONFIG[$userStatus].color}"></span>
				{STATUS_CONFIG[$userStatus].label}
				<ChevronRight size={13} class="menu-arrow" />
			</button>

			<!-- Tema (flyout) -->
			<button bind:this={themeBtnEl} class="menu-item" onclick={openTheme}>
				<span class="menu-item-icon">{THEME_OPTIONS.find(o => o.value === $themeStore)?.icon ?? '◐'}</span>
				Tema — {THEME_OPTIONS.find(o => o.value === $themeStore)?.label}
				<ChevronRight size={13} class="menu-arrow" />
			</button>

			<!-- Ajustes (modal) -->
			<button class="menu-item" onclick={() => openSettingsModal('account')}>
				<span class="menu-item-icon"><Pen size={14} /></span>
				Editar perfil
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
		<button class="user-identity" onclick={() => { profileOpen = !profileOpen; showTheme = false; showStatus = false; }} title="Perfil">
			<div class="sb-avatar">
				{#if $user?.avatarUrl}
					<img src={$user.avatarUrl} alt={$user?.username} />
				{:else if $user}
					<span class="sb-initial">{$user.username[0].toUpperCase()}</span>
				{/if}
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

		<div class="sb-controls">
			<!-- Mic group -->
			<div class="ctrl-group">
				<button class="sb-btn" class:off={$micMuted} title={$micMuted ? 'Activar micro' : 'Silenciar micro'} onclick={toggleMic}>
					{#if $micMuted}<MicOff size={15} />{:else}<Mic size={15} />{/if}
				</button>
				<button bind:this={micChevronEl} class="sb-chevron" class:active={showMicFlyout} title="Opciones de entrada" onclick={openMicFlyout}>
					<ChevronDown size={10} />
				</button>
			</div>

			<!-- Headphone group -->
			<div class="ctrl-group">
				<button class="sb-btn" class:off={$deafened} title={$deafened ? 'Dejar de ensordecer' : 'Ensordecer'} onclick={toggleDeafen}>
					{#if $deafened}<VolumeX size={15} />{:else}<Headphones size={15} />{/if}
				</button>
				<button bind:this={outChevronEl} class="sb-chevron" class:active={showOutFlyout} title="Opciones de salida" onclick={openOutFlyout}>
					<ChevronDown size={10} />
				</button>
			</div>

			<!-- Settings gear -->
			<button class="sb-btn" class:active={showSettingsModal} title="Ajustes" onclick={() => openSettingsModal('account')}>
				<Settings size={15} />
			</button>
		</div>
	</div>
</div>

<style>
	/* ── Fixed wrapper ── */
	.usb-wrap {
		position: fixed; bottom: 0; left: 0;
		width: calc(56px + 240px); z-index: 9999;
		font-family: var(--font-mono);
	}

	/* ── Profile panel ── */
	.profile-panel {
		position: absolute; bottom: 100%; left: 56px; width: 260px; margin-bottom: 4px;
		background: var(--bg-surface); border: 1px solid var(--border);
		border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column;
		box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
	}

	/* ── Generic flyout ── */
	:global(.usb-flyout) {
		position: fixed; z-index: 10000;
		background: var(--bg-surface); border: 1px solid var(--border);
		border-radius: var(--radius-lg); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
		overflow: hidden; font-family: var(--font-mono);
	}

	:global(.theme-flyout) { width: 180px; padding: 0.2rem 0; }
	:global(.status-flyout) { width: 230px; padding: 0.2rem 0; }
	:global(.device-flyout) { width: 260px; padding: 0.5rem 0; }

	.flyout-section-label {
		font-size: 0.6rem; font-weight: 700; color: var(--text-muted);
		letter-spacing: 0.08em; text-transform: uppercase;
		padding: 0.4rem 0.75rem 0.2rem;
	}

	.flyout-sep { height: 1px; background: var(--border); margin: 0.3rem 0; }
	.flyout-empty { font-size: 0.72rem; color: var(--text-muted); padding: 0.25rem 0.75rem; }

	:global(.flyout-item) {
		display: flex; align-items: center; gap: 0.5rem; width: 100%;
		padding: 0.3rem 0.6rem; border: none; background: transparent; cursor: pointer;
		font-size: 0.78rem; color: var(--text-secondary); font-family: var(--font-mono);
		transition: background var(--transition), color var(--transition); text-align: left;
	}

	:global(.flyout-item:hover) { background: var(--bg-elevated); color: var(--text-primary); }
	:global(.flyout-item.active) { color: var(--accent); }
	:global(.flyout-icon) { font-size: 0.8rem; width: 16px; flex-shrink: 0; }
	:global(.flyout-devname) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.flyout-devdot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
	:global(.fl-check) { margin-left: auto; color: var(--accent); flex-shrink: 0; }

	.flyout-slider-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.75rem 0.5rem; }
	.flyout-slider { flex: 1; accent-color: var(--accent); cursor: pointer; }
	.flyout-val { font-size: 0.65rem; color: var(--text-muted); min-width: 32px; text-align: right; }

	/* ── Status flyout items ── */
	:global(.status-flyout-item) { padding: 0.45rem 0.75rem !important; align-items: flex-start !important; }

	.status-bullet { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
	.status-bullet-sm { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.status-texts { display: flex; flex-direction: column; flex: 1; min-width: 0; }
	.status-label { font-size: 0.82rem; color: var(--text-primary); }
	.status-desc { font-size: 0.65rem; color: var(--text-muted); }

	/* ── Settings modal ── */
	.settings-overlay {
		position: fixed; inset: 0; z-index: 10001;
		background: rgba(0,0,0,0.7);
		display: flex; align-items: center; justify-content: center;
	}

	.settings-modal {
		display: flex;
		width: min(600px, 95vw);
		height: min(520px, 90vh);
		background: var(--bg-base);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 24px 64px rgba(0,0,0,0.6);
	}

	.settings-nav {
		width: 180px;
		flex-shrink: 0;
		background: var(--bg-elevated);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 1rem 0.5rem;
		gap: 0.1rem;
		overflow-y: auto;
	}

	.settings-nav-group-label {
		font-size: 0.6rem; font-weight: 700; color: var(--text-muted);
		letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.2rem 0.5rem 0.4rem;
	}

	.settings-nav-item {
		display: flex; align-items: center; gap: 0.4rem; width: 100%;
		padding: 0.4rem 0.5rem; border: none; background: transparent;
		border-radius: var(--radius-sm); color: var(--text-secondary);
		cursor: pointer; font-size: 0.82rem; font-family: var(--font-mono);
		transition: background var(--transition), color var(--transition);
		text-align: left;
	}

	.settings-nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
	.settings-nav-item.active { background: var(--bg-hover); color: var(--text-primary); font-weight: 600; }
	.settings-nav-item.danger:hover { background: var(--error-surface); color: var(--error); }

	.settings-nav-sep { height: 1px; background: var(--border); margin: 0.4rem 0; }

	.settings-body {
		flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;
		background: var(--bg-surface);
	}

	.settings-title-row {
		display: flex; align-items: center; justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.settings-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); }

	.settings-close {
		background: transparent; border: none; cursor: pointer;
		color: var(--text-muted); padding: 0.2rem; border-radius: var(--radius-sm);
		display: flex; align-items: center;
		transition: color var(--transition), background var(--transition);
	}

	.settings-close:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.settings-section { margin-bottom: 1rem; }
	.settings-sep { height: 1px; background: var(--border); margin: 1rem 0; }

	.settings-label {
		font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
		letter-spacing: 0.08em; text-transform: uppercase;
		margin-bottom: 0.4rem;
	}

	.settings-avatar-row { display: flex; align-items: center; gap: 1rem; }

	.settings-avatar-btn {
		position: relative; width: 72px; height: 72px; border-radius: 50%;
		border: 3px solid var(--border); background: var(--bg-elevated);
		overflow: hidden; cursor: pointer; padding: 0; display: flex;
		align-items: center; justify-content: center;
		transition: border-color var(--transition);
	}

	.settings-avatar-btn:hover { border-color: var(--accent); }
	.settings-avatar-btn:disabled { cursor: not-allowed; opacity: 0.6; }
	.settings-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.settings-avatar-initial { font-size: 1.6rem; font-weight: 700; color: var(--accent); }

	.settings-avatar-overlay {
		position: absolute; inset: 0; border-radius: 50%;
		background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center;
		color: #fff; opacity: 0; transition: opacity var(--transition);
	}

	.settings-avatar-btn:hover .settings-avatar-overlay { opacity: 1; }

	.settings-avatar-info { display: flex; flex-direction: column; gap: 0.2rem; }
	.settings-username { font-size: 0.92rem; font-weight: 700; color: var(--text-primary); }
	.settings-usertag { font-size: 0.75rem; color: var(--text-muted); }

	.settings-field-btn {
		display: flex; align-items: center; gap: 0.4rem; background: var(--bg-elevated);
		border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem;
		cursor: pointer; color: var(--text-primary); font-family: inherit; font-size: 0.85rem;
		transition: border-color var(--transition); width: 100%; text-align: left;
	}

	.settings-field-btn:hover { border-color: var(--border-focus); }
	:global(.field-edit-icon) { margin-left: auto; color: var(--text-muted); }

	.settings-edit-row { display: flex; align-items: center; gap: 0.25rem; }

	.settings-input {
		font-size: 0.85rem; padding: 0.4rem 0.5rem; background: var(--bg-elevated);
		border: 1px solid var(--border-focus); border-radius: var(--radius-sm);
		color: var(--text-primary); outline: none; flex: 1; min-width: 0; font-family: inherit;
	}

	.settings-error { font-size: 0.72rem; color: var(--error); margin-top: 0.3rem; }

	.settings-status-grid { display: flex; flex-direction: column; gap: 0.15rem; }

	.settings-status-btn {
		display: flex; align-items: center; gap: 0.6rem; width: 100%;
		padding: 0.45rem 0.6rem; border: none; border-radius: var(--radius-sm);
		background: transparent; cursor: pointer; font-family: inherit;
		transition: background var(--transition);
	}

	.settings-status-btn:hover { background: var(--bg-elevated); }
	.settings-status-btn.active { background: var(--bg-elevated); }
	.settings-status-texts { display: flex; flex-direction: column; flex: 1; }

	.settings-theme-list { display: flex; flex-direction: column; gap: 0.15rem; }

	.settings-theme-btn {
		display: flex; align-items: center; gap: 0.6rem; width: 100%;
		padding: 0.45rem 0.6rem; border: none; border-radius: var(--radius-sm);
		background: transparent; color: var(--text-secondary); cursor: pointer;
		font-size: 0.85rem; font-family: inherit;
		transition: background var(--transition), color var(--transition);
	}

	.settings-theme-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.settings-theme-btn.active { color: var(--accent); background: var(--bg-elevated); }

	.settings-select {
		width: 100%; font-size: 0.8rem; padding: 0.4rem 0.5rem;
		background: var(--bg-elevated); border: 1px solid var(--border);
		border-radius: var(--radius-sm); color: var(--text-primary);
		font-family: var(--font-mono); outline: none; cursor: pointer;
	}

	/* ── Banner + avatar (profile panel) ── */
	.card-header { position: relative; }

	.banner {
		height: 64px;
		background: linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%);
		position: relative; overflow: hidden;
	}

	.banner::after {
		content: ''; position: absolute; inset: 0;
		background: repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(255,255,255,0.015) 12px, rgba(255,255,255,0.015) 13px);
	}

	.header-bottom {
		display: flex; align-items: flex-end; justify-content: space-between;
		padding: 0 0.9rem 0.6rem; margin-top: -28px;
	}

	.avatar-wrap {
		position: relative; width: 56px; height: 56px; border-radius: 50%;
		border: 3px solid var(--bg-surface); background: var(--bg-elevated);
		overflow: hidden; cursor: pointer; flex-shrink: 0; display: flex;
		align-items: center; justify-content: center; padding: 0;
		transition: border-color var(--transition);
	}

	.avatar-wrap:hover { border-color: var(--accent); }
	.avatar-wrap:disabled { cursor: not-allowed; opacity: 0.6; }
	.avatar-lg { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.avatar-initial-lg { font-size: 1.4rem; font-weight: 700; color: var(--accent); line-height: 1; }

	.avatar-overlay {
		position: absolute; inset: 0; border-radius: 50%;
		background: rgba(0,0,0,0.55); display: flex; align-items: center;
		justify-content: center; color: #fff; opacity: 0;
		transition: opacity var(--transition);
	}

	.avatar-wrap:hover .avatar-overlay { opacity: 1; }

	:global(.spin-icon) { animation: spin 0.9s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.role-chip {
		font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
		padding: 0.15rem 0.45rem; border-radius: 999px;
		border: 1px solid var(--accent); color: var(--accent); background: var(--accent-dim);
		margin-bottom: 0.2rem;
	}

	.identity { display: flex; flex-direction: column; gap: 0.1rem; padding: 0 0.9rem 0.75rem; }
	.display-name { font-size: 0.92rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
	.username-tag { font-size: 0.72rem; color: var(--text-muted); }
	.name-edit-row { display: flex; align-items: center; gap: 0.25rem; }

	.name-input {
		font-size: 0.8rem; padding: 0.25rem 0.4rem; background: var(--bg-elevated);
		border: 1px solid var(--border-focus); border-radius: var(--radius-sm);
		color: var(--text-primary); outline: none; flex: 1; min-width: 0; font-family: inherit;
	}

	.icon-btn-sm {
		background: transparent; border: none; cursor: pointer; padding: 0.15rem 0.2rem;
		border-radius: var(--radius-sm); color: var(--text-muted); display: flex; align-items: center;
		transition: background var(--transition), color var(--transition); flex-shrink: 0;
	}

	.icon-btn-sm.ok { color: var(--success); }
	.icon-btn-sm.ok:hover { background: var(--success-surface); }
	.icon-btn-sm:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.name-error { font-size: 0.65rem; color: var(--error); }
	.upload-error { font-size: 0.7rem; color: var(--error); padding: 0 0.9rem 0.5rem; }

	.sep { height: 1px; background: var(--border); margin: 0.1rem 0; }

	.menu-item {
		display: flex; align-items: center; gap: 0.5rem; width: 100%;
		padding: 0.4rem 0.75rem; border: none; background: transparent; cursor: pointer;
		font-size: 0.82rem; color: var(--text-secondary); text-align: left;
		transition: background var(--transition), color var(--transition); font-family: inherit;
	}

	.menu-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.menu-item.danger { color: var(--text-secondary); }
	.menu-item.danger:hover { background: var(--error-surface); color: var(--error); }
	.menu-item-icon { width: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.82rem; }
	:global(.menu-arrow) { margin-left: auto; color: var(--text-muted); flex-shrink: 0; }

	/* ── Status bar ── */
	.status-bar {
		display: flex; align-items: center; padding: 0 0.4rem;
		height: 52px; background: var(--bg-elevated); border-top: 1px solid var(--border); gap: 0.1rem;
	}

	.user-identity {
		display: flex; align-items: center; gap: 0.45rem; min-width: 0; flex: 1;
		background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.35rem;
		border-radius: var(--radius-sm); text-align: left;
		transition: background var(--transition); color: inherit; overflow: hidden;
	}

	.user-identity:hover { background: var(--bg-hover); }

	.sb-avatar {
		position: relative; width: 32px; height: 32px; border-radius: 50%;
		background: var(--bg-surface); border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: visible;
	}

	.sb-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

	.sb-initial {
		font-size: 0.82rem; font-weight: 700; color: var(--accent);
		width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%;
	}

	.status-indicator {
		position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px;
		border-radius: 50%; border: 2px solid var(--bg-elevated);
	}

	.sb-info { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; overflow: hidden; }
	.sb-name { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.sb-sub { font-size: 0.62rem; color: var(--text-muted); white-space: nowrap; }
	.sb-sub.voice-label { color: var(--success); }

	.sb-controls { display: flex; align-items: center; gap: 0.15rem; flex-shrink: 0; }
	.ctrl-group { display: flex; align-items: center; }

	.sb-btn {
		width: 28px; height: 28px; border-radius: var(--radius-sm); border: none;
		background: transparent; cursor: pointer; display: flex; align-items: center;
		justify-content: center; color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
	}

	.sb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-btn.off { color: var(--error); }
	.sb-btn.off:hover { background: var(--error-surface); }
	.sb-btn.active { color: var(--accent); background: var(--accent-dim); }

	.sb-chevron {
		width: 16px; height: 28px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border: none; background: transparent; cursor: pointer;
		display: flex; align-items: center; justify-content: center; color: var(--text-muted);
		transition: background var(--transition), color var(--transition); margin-right: 2px;
	}

	.sb-chevron:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-chevron.active { color: var(--accent); background: var(--accent-dim); }
</style>

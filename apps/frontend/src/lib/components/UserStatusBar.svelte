<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeBase, themeAccent, BASE_OPTIONS, ACCENT_OPTIONS } from '$lib/theme.js';
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
	let ppExpand = $state<null | 'status' | 'theme'>(null);
	let showMicFlyout = $state(false);
	let showOutFlyout = $state(false);
	let showSettingsModal = $state(false);
	let settingsTab = $state<'account' | 'profile' | 'voice' | 'appearance'>('account');

	// ── Flyout positions ──────────────────────────────────────────────────
	let micFlyoutLeft = $state(0);
	let outFlyoutLeft = $state(0);

	// ── Element refs ──────────────────────────────────────────────────────
	let micChevronEl = $state<HTMLButtonElement | null>(null);
	let outChevronEl = $state<HTMLButtonElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let settingsFileInput = $state<HTMLInputElement | null>(null);

	// ── Camera (voice settings) ───────────────────────────────────────────
	let videoDevices = $state<MediaDeviceInfo[]>([]);
	let selectedVideoId = $state('');
	let videoPreviewEl = $state<HTMLVideoElement | null>(null);
	let videoStream = $state<MediaStream | null>(null);

	async function loadVideoDevices() {
		try {
			const s = await navigator.mediaDevices.getUserMedia({ video: true });
			s.getTracks().forEach(t => t.stop());
		} catch { /* denied or unavailable */ }
		const all = await navigator.mediaDevices.enumerateDevices();
		videoDevices = all.filter(d => d.kind === 'videoinput');
		if (videoDevices.length > 0 && !selectedVideoId) selectedVideoId = videoDevices[0].deviceId;
	}

	async function startVideoPreview(deviceId: string) {
		if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
		if (!deviceId) return;
		try {
			videoStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
		} catch { /* denied */ }
	}

	$effect(() => {
		if (videoPreviewEl && videoStream) videoPreviewEl.srcObject = videoStream;
	});

	$effect(() => {
		if (!showSettingsModal && videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
	});

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

	// ── Profile tab state ─────────────────────────────────────────────────
	let profileBio = $state('');
	let profilePronouns = $state('');
	let profileBannerColor = $state('#5865f2');
	let profileSaving = $state(false);
	let profileSaved = $state(false);
	let profileError = $state('');

	$effect(() => {
		if (settingsTab === 'profile' && $user) {
			profileBio = $user.bio ?? '';
			profilePronouns = $user.pronouns ?? '';
			profileBannerColor = $user.bannerColor ?? '#5865f2';
		}
	});

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
		ppExpand = null;
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
		await Promise.all([livekitStore.enumerateDevices(), loadVideoDevices()]);
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

	async function saveProfile() {
		profileSaving = true; profileError = ''; profileSaved = false;
		try {
			await authStore.updateProfile({ bio: profileBio, pronouns: profilePronouns, bannerColor: profileBannerColor });
			profileSaved = true;
			setTimeout(() => { profileSaved = false; }, 2000);
		} catch (err) {
			profileError = err instanceof Error ? err.message : 'Error al guardar';
		} finally {
			profileSaving = false;
		}
	}

	async function saveName(isSettings = false) {
		const val = isSettings ? settingsNameInput : nameInput;
		if (isSettings) settingsNameError = ''; else nameError = '';
		try {
			await authStore.updateProfile({ name: val });
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
				<div class="settings-nav-group-label">Ajustes de usuario</div>
				<button class="settings-nav-item" class:active={settingsTab === 'account'} onclick={() => (settingsTab = 'account')}>Mi cuenta</button>
				<button class="settings-nav-item" class:active={settingsTab === 'profile'} onclick={() => (settingsTab = 'profile')}>Perfil</button>
				<!-- TODO: privacidad — DM permissions, friend requests, activity status; requires backend privacy settings -->
				<button class="settings-nav-item" disabled title="Próximamente">Privacidad</button>
				<div class="settings-nav-group-label" style="margin-top:0.5rem">Ajustes de la app</div>
				<button class="settings-nav-item" class:active={settingsTab === 'appearance'} onclick={() => (settingsTab = 'appearance')}>Apariencia</button>
				<!-- TODO: notificaciones — per-channel notification preferences; requires backend notification settings -->
				<button class="settings-nav-item" disabled title="Próximamente">Notificaciones</button>
				<button class="settings-nav-item" class:active={settingsTab === 'voice'} onclick={async () => { settingsTab = 'voice'; await loadVoiceDevices(); }}>Voz y vídeo</button>
				<div class="settings-nav-sep"></div>
				<button class="settings-nav-item danger" onclick={handleLogout}><LogOut size={13} /> Cerrar sesión</button>
			</nav>

			<!-- Content -->
			<div class="settings-body">
				<div class="settings-title-row">
					<h2 class="settings-title">
						{#if settingsTab === 'account'}Mi cuenta{:else if settingsTab === 'profile'}Perfil{:else if settingsTab === 'voice'}Voz y audio{:else}Apariencia{/if}
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

				{:else if settingsTab === 'profile'}
					<!-- Banner color preview -->
					<div class="settings-section">
						<div class="settings-label">Color del banner</div>
						<div class="profile-banner-preview" style="background:{profileBannerColor}">
							<div class="profile-banner-avatar">
								{#if $user?.avatarUrl}
									<img src={$user.avatarUrl} alt="" />
								{:else if $user}
									<span>{$user.username[0].toUpperCase()}</span>
								{/if}
							</div>
						</div>
						<div class="profile-color-row">
							<input type="color" class="profile-color-input" bind:value={profileBannerColor} />
							<span class="profile-color-hex">{profileBannerColor}</span>
						</div>
					</div>

					<div class="settings-sep"></div>

					<!-- Pronouns -->
					<div class="settings-section">
						<div class="settings-label">Pronombres</div>
						<input
							class="settings-input"
							bind:value={profilePronouns}
							placeholder="ej. él/ellos, ella/ellas"
							maxlength="40"
						/>
					</div>

					<!-- Bio -->
					<div class="settings-section">
						<div class="settings-label">Biografía</div>
						<textarea
							class="settings-textarea"
							bind:value={profileBio}
							placeholder="Cuéntanos algo sobre ti…"
							maxlength="190"
							rows="4"
						></textarea>
						<span class="profile-char-count">{profileBio.length}/190</span>
					</div>

					<div class="settings-save-row">
						{#if profileError}<p class="settings-error">{profileError}</p>{/if}
						<button class="btn-primary" onclick={saveProfile} disabled={profileSaving}>
							{profileSaving ? 'Guardando…' : profileSaved ? '✓ Guardado' : 'Guardar cambios'}
						</button>
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

					<div class="settings-sep"></div>

					<div class="settings-section">
						<div class="settings-label">Cámara</div>
						{#if videoDevices.length === 0}
							<p class="flyout-empty">No se detectaron cámaras</p>
						{:else}
							<select
								class="settings-select"
								value={selectedVideoId}
								onchange={async (e) => { selectedVideoId = (e.target as HTMLSelectElement).value; await startVideoPreview(selectedVideoId); }}
							>
								{#each videoDevices as dev (dev.deviceId)}
									<option value={dev.deviceId}>{dev.label}</option>
								{/each}
							</select>
						{/if}
						{#if videoStream}
							<div class="cam-preview-wrap">
								<!-- svelte-ignore a11y_media_has_caption -->
								<video bind:this={videoPreviewEl} autoplay muted playsinline class="cam-preview"></video>
							</div>
						{:else if videoDevices.length > 0}
							<button class="cam-preview-start" onclick={() => startVideoPreview(selectedVideoId)}>
								Ver preview
							</button>
						{/if}
					</div>

				{:else}
					<!-- Apariencia -->
					<div class="settings-section">
						<div class="settings-label">Fondo</div>
						<div class="settings-base-cards">
							{#each BASE_OPTIONS as opt}
								<button
									class="settings-base-card"
									class:active={$themeBase === opt.value}
									onclick={() => themeBase.set(opt.value)}
								>
									<span class="sbc-preview {opt.value === 'noche' ? 'sbc-noche' : 'sbc-dia'}">
										<span class="sbc-bar"></span>
										<span class="sbc-bar sbc-short"></span>
									</span>
									<span class="sbc-label">
										{opt.label}
										{#if $themeBase === opt.value}<Check size={13} class="sbc-check" />{/if}
									</span>
								</button>
							{/each}
						</div>
					</div>
					<div class="settings-section">
						<div class="settings-label">Color de acento</div>
						<div class="settings-accent-grid">
							{#each ACCENT_OPTIONS as opt}
								<button
									class="settings-accent-chip"
									class:active={$themeAccent === opt.value}
									style="--sw:{opt.color}"
									onclick={() => themeAccent.set(opt.value)}
								>
									<span class="accent-dot" style="background:{opt.color}"></span>
									<span>{opt.label}</span>
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

			<!-- Estado (inline accordion) -->
			<button class="pp-row-toggle" class:open={ppExpand === 'status'}
				onclick={() => ppExpand = ppExpand === 'status' ? null : 'status'}>
				<span class="status-bullet-sm" style="background:{STATUS_CONFIG[$userStatus].color}"></span>
				<span class="pp-row-label">Estado</span>
				<span class="pp-row-value">{STATUS_CONFIG[$userStatus].label}</span>
				<ChevronDown size={13} class="pp-caret" />
			</button>
			{#if ppExpand === 'status'}
				<div class="pp-collapse pp-status-row">
					{#each Object.entries(STATUS_CONFIG) as [key, cfg]}
						<button
							class="pp-status-btn"
							class:active={$userStatus === key}
							onclick={() => { userStatus.set(key as UserStatus); ppExpand = null; }}
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

			<!-- Tema (inline accordion) -->
			<button class="pp-row-toggle" class:open={ppExpand === 'theme'}
				onclick={() => ppExpand = ppExpand === 'theme' ? null : 'theme'}>
				<span class="pp-swatch-mini" style="--sw:{ACCENT_OPTIONS.find(o => o.value === $themeAccent)?.color}"></span>
				<span class="pp-row-label">Tema</span>
				<span class="pp-row-value">{BASE_OPTIONS.find(o => o.value === $themeBase)?.label} · {ACCENT_OPTIONS.find(o => o.value === $themeAccent)?.label}</span>
				<ChevronDown size={13} class="pp-caret" />
			</button>
			{#if ppExpand === 'theme'}
				<div class="pp-collapse">
					<div class="pp-base-row">
						{#each BASE_OPTIONS as opt}
							<button
								class="pp-base-btn"
								class:active={$themeBase === opt.value}
								onclick={() => themeBase.set(opt.value)}
							>{opt.label}</button>
						{/each}
					</div>
					<div class="pp-theme-row">
						{#each ACCENT_OPTIONS as opt}
							<button
								class="pp-theme-sw"
								class:active={$themeAccent === opt.value}
								style="--sw:{opt.color}"
								title={opt.label}
								onclick={() => themeAccent.set(opt.value)}
							></button>
						{/each}
					</div>
				</div>
			{/if}

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
		<button class="user-identity" onclick={() => { profileOpen = !profileOpen; ppExpand = null; }} title="Perfil">
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
		width: calc(72px + 264px); z-index: 9999;
		font-family: var(--font-ui);
	}

	@media (max-width: 768px) {
		.usb-wrap { width: 100%; }
		.status-bar { border-top-right-radius: 0; }
		.profile-panel { left: 0; width: calc(100% - 72px); }
	}

	/* ── Profile panel ── */
	.profile-panel {
		position: absolute; bottom: 100%; left: 72px; width: 270px; margin-bottom: 4px;
		background: var(--bg-surface); border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column;
		box-shadow: var(--shadow-pop);
		animation: pop 0.16s ease;
	}

	@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }

	/* ── Generic flyout ── */
	:global(.usb-flyout) {
		position: fixed; z-index: 10000;
		background: var(--bg-surface); border: 1px solid var(--border);
		border-radius: var(--radius-lg); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
		overflow: hidden; font-family: var(--font-mono);
	}

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

	/* ── Settings overlay (full-screen) ── */
	.settings-overlay {
		position: fixed; inset: 0; z-index: 10001;
		background: var(--bg-base);
		display: flex;
	}

	.settings-modal {
		display: flex;
		width: 100%;
		height: 100%;
	}

	.settings-nav {
		width: 240px;
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

	.settings-nav-item:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
	.settings-nav-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; }
	.settings-nav-item.danger:hover { background: var(--error-surface); color: var(--error); }
	.settings-nav-item:disabled { opacity: 0.35; cursor: not-allowed; }

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

	/* ── Profile tab ── */
	.profile-banner-preview {
		height: 80px; border-radius: var(--radius); margin-bottom: 0.5rem;
		position: relative; overflow: visible;
	}
	.profile-banner-avatar {
		position: absolute; bottom: -16px; left: 1rem;
		width: 52px; height: 52px; border-radius: 50%;
		background: var(--bg-surface); border: 3px solid var(--bg-base);
		display: flex; align-items: center; justify-content: center;
		font-size: 1.1rem; font-weight: 700; color: var(--accent); overflow: hidden;
	}
	.profile-banner-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.profile-color-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.9rem; }
	.profile-color-input { width: 36px; height: 36px; border: none; border-radius: var(--radius-sm); padding: 2px; background: none; cursor: pointer; }
	.profile-color-hex { font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); }
	.settings-textarea {
		width: 100%; min-height: 80px; resize: vertical;
		font-size: 0.85rem; padding: 0.45rem 0.5rem; background: var(--bg-elevated);
		border: 1px solid var(--border-focus); border-radius: var(--radius-sm);
		color: var(--text-primary); outline: none; font-family: inherit;
		box-sizing: border-box; line-height: 1.5;
	}
	.settings-textarea:focus { border-color: var(--accent); }
	.profile-char-count { font-size: 0.68rem; color: var(--text-muted); display: block; text-align: right; margin-top: 0.2rem; }
	.settings-save-row { display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; margin-top: 0.5rem; }
	.btn-primary {
		padding: 0.45rem 1.1rem; background: var(--accent); color: var(--accent-text);
		border: none; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 700;
		cursor: pointer; font-family: inherit; transition: filter var(--transition);
	}
	.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

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

	/* Settings appearance: base cards */
	.settings-base-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }

	.settings-base-card {
		display: flex; flex-direction: column; gap: 0.6rem; padding: 0.7rem;
		background: var(--bg-surface); border: 2px solid var(--border); border-radius: var(--radius-lg);
		transition: all var(--transition); text-align: left; cursor: pointer;
		font-family: var(--font-ui);
	}
	.settings-base-card:hover { border-color: var(--border-strong); }
	.settings-base-card.active { border-color: var(--accent); }

	.sbc-preview { height: 48px; border-radius: var(--radius); display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 0 10px; border: 1px solid var(--border); }
	.sbc-noche { background: #1d1a25; }
	.sbc-dia   { background: #f3efe8; }
	.sbc-bar   { height: 6px; width: 70%; border-radius: 4px; background: var(--accent); }
	.sbc-short { width: 45%; background: rgba(128,128,128,0.3); }
	.sbc-noche .sbc-short { background: rgba(255,255,255,0.2); }
	.sbc-dia   .sbc-short { background: rgba(0,0,0,0.15); }

	.sbc-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: var(--text-primary); }
	:global(.sbc-check) { margin-left: auto; color: var(--accent); }

	/* Settings appearance: accent chips */
	.settings-accent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.55rem; }

	.settings-accent-chip {
		display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem;
		background: var(--bg-surface); border: 2px solid var(--border); border-radius: var(--radius);
		font-size: 0.82rem; font-weight: 700; color: var(--text-secondary);
		transition: all var(--transition); cursor: pointer; font-family: var(--font-ui);
	}
	.settings-accent-chip:hover { border-color: var(--border-strong); }
	.settings-accent-chip.active { border-color: var(--sw, var(--accent)); color: var(--text-primary); }

	.accent-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 3px color-mix(in oklab, var(--sw, var(--accent)) 22%, transparent); }

	.settings-select {
		width: 100%; font-size: 0.8rem; padding: 0.4rem 0.5rem;
		background: var(--bg-elevated); border: 1px solid var(--border);
		border-radius: var(--radius-sm); color: var(--text-primary);
		font-family: var(--font-mono); outline: none; cursor: pointer;
	}

	.cam-preview-wrap {
		margin-top: 0.6rem; border-radius: var(--radius); overflow: hidden;
		background: #000; aspect-ratio: 16/9;
	}
	.cam-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
	.cam-preview-start {
		margin-top: 0.5rem; padding: 0.4rem 0.8rem; background: var(--bg-elevated);
		border: 1px solid var(--border); border-radius: var(--radius-sm);
		color: var(--text-secondary); font-size: 0.78rem; font-family: inherit;
		cursor: pointer; transition: border-color var(--transition), color var(--transition);
	}
	.cam-preview-start:hover { border-color: var(--accent); color: var(--accent); }

	/* ── Banner + avatar (profile panel) ── */
	.card-header { position: relative; }

	.banner {
		height: 64px;
		background: linear-gradient(120deg, var(--accent), var(--accent-strong));
		position: relative; overflow: hidden;
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
		display: flex; align-items: center; padding: 0.5rem;
		height: 60px;
		background: color-mix(in oklab, var(--bg-elevated) 92%, #000 8%);
		border-top: 1px solid var(--border);
		border-top-right-radius: var(--radius-lg);
		gap: 0.1rem;
	}

	.user-identity {
		display: flex; align-items: center; gap: 0.45rem; min-width: 0; flex: 1;
		background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.35rem;
		border-radius: var(--radius-sm); text-align: left;
		transition: background var(--transition); color: inherit; overflow: hidden;
	}

	.user-identity:hover { background: var(--bg-hover); }

	.sb-avatar {
		position: relative; width: 38px; height: 38px; border-radius: 50%;
		background: var(--bg-surface); border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: visible;
	}

	.sb-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

	.sb-initial {
		font-size: 0.95rem; font-weight: 700; color: var(--accent);
		width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%;
	}

	.status-indicator {
		position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px;
		border-radius: 50%; border: 2px solid var(--bg-elevated);
	}

	.sb-info { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; overflow: hidden; }
	.sb-name { font-size: 0.85rem; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.sb-sub { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); white-space: nowrap; }
	.sb-sub.voice-label { color: var(--success); }

	.sb-controls { display: flex; align-items: center; gap: 0.15rem; flex-shrink: 0; }
	.ctrl-group { display: flex; align-items: center; }

	.sb-btn {
		width: 36px; height: 36px; border-radius: var(--radius-sm); border: none;
		background: transparent; cursor: pointer; display: flex; align-items: center;
		justify-content: center; color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
	}

	.sb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-btn.off { color: var(--error); }
	.sb-btn.off:hover { background: var(--error-surface); }
	.sb-btn.active { color: var(--accent); background: var(--accent-dim); }
	:global(.sb-btn svg) { width: 18px; height: 18px; }

	.sb-chevron {
		width: 16px; height: 36px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border: none; background: transparent; cursor: pointer;
		display: flex; align-items: center; justify-content: center; color: var(--text-muted);
		transition: background var(--transition), color var(--transition); margin-right: 2px;
	}

	.sb-chevron:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sb-chevron.active { color: var(--accent); background: var(--accent-dim); }

	/* ── Profile panel inline accordion ── */
	.pp-row-toggle {
		display: flex; align-items: center; gap: 0.6rem;
		width: calc(100% - 0.8rem); margin: 0.1rem 0.4rem;
		padding: 0.5rem 0.6rem; background: transparent; border: none;
		border-radius: var(--radius); color: var(--text-secondary);
		font-size: 0.82rem; cursor: pointer; font-family: inherit;
		transition: background var(--transition), color var(--transition);
	}
	.pp-row-toggle:hover { background: var(--bg-hover); color: var(--text-primary); }
	.pp-row-toggle.open { background: var(--bg-hover); color: var(--text-primary); }
	.pp-row-label { font-weight: 700; }
	.pp-row-value { margin-left: auto; font-size: 0.76rem; color: var(--text-muted); font-weight: 600; white-space: nowrap; margin-right: 0.25rem; }
	:global(.pp-caret) { opacity: 0.55; transition: transform var(--transition); flex-shrink: 0; }
	.pp-row-toggle.open :global(.pp-caret) { transform: rotate(180deg); }

	.pp-swatch-mini {
		width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0;
		border: 1.5px solid var(--border-strong);
		background: linear-gradient(135deg, var(--sw) 0 50%, var(--swatch-base) 50% 100%);
	}

	@keyframes ppslide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
	.pp-collapse { animation: ppslide 0.18s var(--ease-bounce); padding-top: 0.1rem; }

	.pp-status-row { display: flex; flex-direction: column; gap: 0.05rem; padding: 0.1rem 0.4rem 0.3rem; }
	.pp-status-btn {
		display: flex; align-items: center; gap: 0.6rem; width: 100%;
		padding: 0.45rem 0.6rem; background: transparent; border: none;
		border-radius: var(--radius); color: var(--text-secondary);
		font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit;
		transition: background var(--transition), color var(--transition);
	}
	.pp-status-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.pp-status-btn.active { background: var(--accent-dim); color: var(--accent); }

	.pp-base-row { display: flex; gap: 0.4rem; padding: 0.1rem 0.75rem 0.4rem; }
	.pp-base-btn {
		flex: 1; padding: 0.4rem 0.5rem;
		background: var(--bg-elevated); border: 1.5px solid var(--border);
		border-radius: var(--radius); color: var(--text-secondary);
		font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: inherit;
		transition: all var(--transition);
	}
	.pp-base-btn:hover { border-color: var(--border-strong); color: var(--text-primary); }
	.pp-base-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

	.pp-theme-row { display: flex; gap: 0.4rem; padding: 0.3rem 0.75rem 0.7rem; flex-wrap: wrap; }
	.pp-theme-sw {
		width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
		border: 2px solid var(--border-strong);
		background: linear-gradient(135deg, var(--sw) 0 50%, var(--swatch-base) 50% 100%);
		transition: transform var(--transition) var(--ease-bounce), border-color var(--transition);
	}
	.pp-theme-sw:hover { transform: scale(1.12); }
	.pp-theme-sw.active { border-color: var(--accent); }
</style>

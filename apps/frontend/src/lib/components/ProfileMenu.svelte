<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeBase, themeAccent, BASE_OPTIONS, ACCENT_OPTIONS } from '$lib/theme.js';
	import { Check, X, LogOut, UserRound, Pen, Upload, Loader2 } from 'lucide-svelte';

	const { user } = authStore;

	let open = $state(false);
	let uploading = $state(false);
	let uploadError = $state('');
	let editingName = $state(false);
	let nameInput = $state('');
	let nameError = $state('');
	let panelTop = $state(0);
	let panelLeft = $state(0);
	let btnEl: HTMLButtonElement;
	let fileInput: HTMLInputElement;

	function handleWindowClick(e: MouseEvent) {
		if (open && !(e.target as Element).closest('.profile-menu')) open = false;
	}

	async function handleLogout() {
		open = false;
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
</script>

<svelte:window onclick={handleWindowClick} />

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/gif,image/webp"
	style="display:none"
	onchange={handleFileChange}
/>

<div class="profile-menu">
	<button bind:this={btnEl} class="avatar-btn" onclick={() => {
		const r = btnEl.getBoundingClientRect();
		const panelH = 380;
		panelTop = r.bottom + panelH > window.innerHeight ? r.top - panelH : r.bottom + 8;
		panelLeft = r.right + 8;
		open = !open;
	}} aria-label="Perfil y ajustes">
		{#if $user?.avatarUrl}
			<img src={$user.avatarUrl} alt={$user.username} class="avatar-img" />
		{:else if $user}
			<span class="avatar-initial">{$user.username[0].toUpperCase()}</span>
		{:else}
			<span class="avatar-icon"><UserRound size={18} /></span>
		{/if}
	</button>

	{#if open}
		<div class="panel" style="top:{panelTop}px; left:{panelLeft}px;">
			{#if $user}
				<!-- Banner + avatar header -->
				<div class="card-header">
					<div class="banner"></div>
					<div class="header-bottom">
						<button
							class="avatar-wrap"
							onclick={() => fileInput.click()}
							disabled={uploading}
							title="Cambiar foto de perfil"
						>
							{#if $user.avatarUrl}
								<img src={$user.avatarUrl} alt={$user.username} class="avatar-lg" />
							{:else}
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
						{#if $user.role === 'ADMIN' || $user.role === 'SUPERADMIN'}
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
							<button class="icon-btn-sm" onclick={() => editingName = false}><X size={13} /></button>
						</div>
						{#if nameError}<span class="name-error">{nameError}</span>{/if}
					{:else}
						<button class="name-btn" onclick={() => { nameInput = $user?.name ?? ''; editingName = true; }}>
							<span class="display-name">{$user.name || $user.username}</span>
							<span class="edit-hint"><Pen size={11} /></span>
						</button>
					{/if}
					<span class="username">@{$user.username}</span>
				</div>

				{#if uploadError}
					<p class="upload-error">{uploadError}</p>
				{/if}

				<div class="sep"></div>
			{/if}

			<!-- Theme -->
			<div class="section">
				<span class="section-label">Fondo</span>
				<div class="base-row">
					{#each BASE_OPTIONS as opt}
						<button
							class="base-btn"
							class:active={$themeBase === opt.value}
							onclick={() => themeBase.set(opt.value)}
						>{opt.label}</button>
					{/each}
				</div>
				<span class="section-label" style="margin-top:0.4rem">Acento</span>
				<div class="accent-row">
					{#each ACCENT_OPTIONS as opt}
						<button
							class="accent-dot-btn"
							class:active={$themeAccent === opt.value}
							style="background:{opt.color}"
							title={opt.label}
							onclick={() => themeAccent.set(opt.value)}
						></button>
					{/each}
				</div>
			</div>

			{#if $user}
				<div class="sep"></div>
				<button class="action-item danger" onclick={handleLogout}>
					<LogOut size={14} />
					Cerrar sesión
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.profile-menu {
		position: relative;
		z-index: 200;
		font-family: var(--font-mono);
	}

	/* ── Trigger button ── */
	.avatar-btn {
		width: 36px; height: 36px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 2px solid var(--border);
		color: var(--accent);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--transition), transform var(--transition);
		overflow: hidden;
		padding: 0;
	}

	.avatar-btn:hover { border-color: var(--accent); transform: scale(1.06); }
	.avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.avatar-initial, .avatar-icon { line-height: 1; }

	/* ── Panel ── */
	.panel {
		position: fixed;
		z-index: 9999;
		width: 260px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
	}

	/* ── Card header (banner + avatar) ── */
	.card-header {
		position: relative;
		margin-bottom: 0;
	}

	.banner {
		height: 64px;
		background: linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%);
		border-bottom: 1px solid var(--border);
		position: relative;
		overflow: hidden;
	}

	.banner::after {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 12px,
			rgba(255,255,255,0.015) 12px,
			rgba(255,255,255,0.015) 13px
		);
	}

	.header-bottom {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding: 0 0.9rem 0.6rem;
		margin-top: -28px;
	}

	/* ── Large avatar ── */
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

	.avatar-lg {
		width: 100%; height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

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

	/* ── Identity ── */
	.identity {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0 0.9rem 0.75rem;
	}

	.name-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.display-name {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.edit-hint {
		color: var(--text-muted);
		opacity: 0;
		transition: opacity var(--transition);
		display: flex;
		align-items: center;
	}

	.name-btn:hover .edit-hint { opacity: 1; }

	.username {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.name-edit-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

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

	.upload-error {
		font-size: 0.7rem;
		color: var(--error);
		padding: 0 0.9rem 0.5rem;
	}

	/* ── Separator ── */
	.sep { height: 1px; background: var(--border); margin: 0.15rem 0; }

	/* ── Section ── */
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.5rem 0.5rem;
	}

	.section-label {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--text-muted);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0 0.3rem 0.1rem;
	}

	/* ── Theme controls ── */
	.base-row { display: flex; gap: 0.35rem; margin-top: 0.2rem; }
	.base-btn {
		flex: 1; padding: 0.35rem 0.4rem; background: var(--bg-elevated); border: 1.5px solid var(--border);
		border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 0.76rem; font-weight: 700;
		cursor: pointer; font-family: inherit; transition: all var(--transition);
	}
	.base-btn:hover { border-color: var(--border-strong); color: var(--text-primary); }
	.base-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

	.accent-row { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.2rem; }
	.accent-dot-btn {
		width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent;
		cursor: pointer; transition: transform var(--transition), border-color var(--transition);
	}
	.accent-dot-btn:hover { transform: scale(1.15); }
	.accent-dot-btn.active { border-color: var(--text-primary); }

	/* ── Action items ── */
	.action-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.8rem;
		text-align: left;
		transition: background var(--transition), color var(--transition);
		font-family: inherit;
		margin: 0.15rem 0;
	}

	.action-item.danger { color: var(--text-secondary); }
	.action-item.danger:hover { background: var(--error-surface); color: var(--error); }
</style>

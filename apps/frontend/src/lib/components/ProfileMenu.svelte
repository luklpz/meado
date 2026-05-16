<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeStore, THEME_OPTIONS, type Theme } from '$lib/theme.js';

	const { user } = authStore;

	let open = $state(false);
	let uploading = $state(false);
	let uploadError = $state('');

	let fileInput: HTMLInputElement;

	function handleWindowClick(e: MouseEvent) {
		if (open && !(e.target as Element).closest('.profile-menu')) open = false;
	}

	async function handleLogout() {
		open = false;
		await authStore.logout();
		goto('/login');
	}

	function setTheme(t: Theme) {
		themeStore.set(t);
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
	<button class="avatar-btn" onclick={() => (open = !open)} aria-label="Perfil y ajustes">
		{#if $user?.avatarUrl}
			<img src={$user.avatarUrl} alt={$user.username} class="avatar-img" />
		{:else if $user}
			<span class="avatar-initial">{$user.username[0].toUpperCase()}</span>
		{:else}
			<span class="avatar-icon">◐</span>
		{/if}
	</button>

	{#if open}
		<div class="panel">
			{#if $user}
				<div class="user-card">
					<div class="user-avatar-lg">
						{#if $user.avatarUrl}
							<img src={$user.avatarUrl} alt={$user.username} class="avatar-img-lg" />
						{:else}
							<span class="initial-lg">{$user.username[0].toUpperCase()}</span>
						{/if}
					</div>
					<div class="user-meta">
						<span class="user-name">{$user.username}</span>
						{#if $user.role === 'ADMIN' || $user.role === 'SUPERADMIN'}
							<span class="role-badge">Admin</span>
						{/if}
					</div>
				</div>

				<div class="sep"></div>

				<button
					class="action-item"
					onclick={() => fileInput.click()}
					disabled={uploading}
				>
					<span class="action-icon">{uploading ? '⟳' : '◎'}</span>
					{uploading ? 'Subiendo…' : 'Cambiar foto de perfil'}
				</button>

				{#if uploadError}
					<p class="upload-error">{uploadError}</p>
				{/if}

				<div class="sep"></div>
			{/if}

			<div class="theme-section">
				<span class="section-label">Tema</span>
				<div class="theme-grid">
					{#each THEME_OPTIONS as opt}
						<button
							class="theme-btn"
							class:active={$themeStore === opt.value}
							onclick={() => setTheme(opt.value)}
							title={opt.label}
						>
							<span class="theme-icon">{opt.icon}</span>
							<span>{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			{#if $user}
				<div class="sep"></div>
				<button class="danger-item" onclick={handleLogout}>
					<span class="action-icon">→</span>
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

	/* ── Avatar button ── */
	.avatar-btn {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 2px solid var(--border);
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--transition), transform var(--transition);
		overflow: hidden;
		padding: 0;
	}

	.avatar-btn:hover { border-color: var(--accent); transform: scale(1.05); }

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.avatar-initial, .avatar-icon { line-height: 1; }

	/* ── Panel ── */
	.panel {
		position: absolute;
		bottom: calc(100% + 0.6rem);
		left: calc(100% + 0.4rem);
		min-width: 220px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
	}

	/* ── User card ── */
	.user-card {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.55rem 0.6rem;
	}

	.user-avatar-lg {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
		flex-shrink: 0;
		overflow: hidden;
	}

	.avatar-img-lg {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.initial-lg { line-height: 1; }

	.user-meta { display: flex; flex-direction: column; gap: 0.2rem; }

	.user-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }

	.role-badge {
		font-size: 0.58rem;
		padding: 0.08rem 0.32rem;
		border: 1px solid var(--accent);
		border-radius: 2px;
		color: var(--accent);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		width: fit-content;
	}

	/* ── Separator ── */
	.sep { height: 1px; background: var(--border); margin: 0.2rem 0; }

	/* ── Action items ── */
	.action-item, .danger-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.38rem 0.6rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		font-size: 0.78rem;
		text-align: left;
		transition: background var(--transition), color var(--transition);
	}

	.action-item { color: var(--text-secondary); }
	.action-item:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.action-item:disabled { opacity: 0.5; cursor: not-allowed; }

	.danger-item { color: var(--text-secondary); }
	.danger-item:hover { background: var(--error-surface); color: var(--error); }

	.action-icon { font-size: 0.8rem; }

	.upload-error {
		font-size: 0.7rem;
		color: var(--error);
		padding: 0 0.6rem;
	}

	/* ── Theme section ── */
	.theme-section {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.3rem 0.6rem;
	}

	.section-label {
		font-size: 0.62rem;
		color: var(--text-muted);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.theme-grid { display: flex; flex-direction: column; gap: 0.05rem; }

	.theme-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.28rem 0.4rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.76rem;
		width: 100%;
		transition: background var(--transition), border-color var(--transition), color var(--transition);
	}

	.theme-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.theme-btn.active {
		border-color: var(--border-focus);
		color: var(--accent);
		background: var(--accent-dim);
	}

	.theme-icon { font-size: 0.75rem; }
</style>

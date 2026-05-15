<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { themeStore, THEME_OPTIONS, type Theme } from '$lib/theme.js';

	const { user } = authStore;
	let open = $state(false);

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
</script>

<svelte:window onclick={handleWindowClick} />

<div class="profile-menu">
	<button class="avatar-btn" onclick={() => (open = !open)} aria-label="Perfil y ajustes">
		{#if $user}
			{$user.username[0].toUpperCase()}
		{:else}
			◐
		{/if}
	</button>

	{#if open}
		<div class="dropdown">
			{#if $user}
				<div class="user-info">
					<span class="username">{$user.username}</span>
					{#if $user.role === 'ADMIN' || $user.role === 'SUPERADMIN'}
						<span class="badge">admin</span>
					{/if}
				</div>
				<div class="sep"></div>
			{/if}

			<div class="theme-section">
				<span class="section-label">Tema</span>
				<div class="theme-list">
					{#each THEME_OPTIONS as opt}
						<button
							class="theme-btn"
							class:active={$themeStore === opt.value}
							onclick={() => setTheme(opt.value)}
						>
							<span class="theme-icon">{opt.icon}</span>
							<span>{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			{#if $user}
				<div class="sep"></div>
				<button class="logout-btn" onclick={handleLogout}>Cerrar sesión</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.profile-menu {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 200;
		font-family: var(--font-mono);
	}

	.avatar-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--transition), background var(--transition);
	}

	.avatar-btn:hover {
		border-color: var(--accent);
		background: var(--bg-elevated);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		min-width: 190px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
	}

	.username {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.badge {
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--accent);
		border-radius: 2px;
		color: var(--accent);
		letter-spacing: 0.05em;
	}

	.sep {
		height: 1px;
		background: var(--border);
		margin: 0.2rem 0;
	}

	.theme-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.3rem 0.5rem;
	}

	.section-label {
		font-size: 0.62rem;
		color: var(--text-muted);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.theme-list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.theme-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.76rem;
		text-align: left;
		width: 100%;
		transition: background var(--transition), border-color var(--transition), color var(--transition);
	}

	.theme-btn:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}

	.theme-btn.active {
		border-color: var(--border-focus);
		color: var(--accent);
		background: var(--accent-dim);
	}

	.theme-icon { font-size: 0.75rem; }

	.logout-btn {
		display: block;
		width: 100%;
		padding: 0.32rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.76rem;
		text-align: left;
		transition: background var(--transition), color var(--transition);
	}

	.logout-btn:hover {
		background: var(--error-surface);
		color: var(--error);
	}
</style>

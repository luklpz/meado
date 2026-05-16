<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import { dmUnread } from '$lib/dmStore.js';

	let { data, children } = $props();

	onMount(() => {
		authStore.init();
	});

	const user = $derived(data.user as { id: string; username: string; role: string; avatarUrl?: string | null } | null);
	const servers = $derived((data.servers ?? []) as any[]);
	const myServers = $derived(servers.filter((s: any) => s.isMember));
	const otherServers = $derived(servers.filter((s: any) => !s.isMember));
	const isAdmin = $derived(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN');

	function isActiveServer(slug: string) {
		return $page.url.pathname.startsWith(`/servers/${slug}`);
	}

	const isHome = $derived($page.url.pathname.startsWith('/home'));
	const totalDmUnread = $derived([...$dmUnread.values()].reduce((a, b) => a + b, 0));

	// ── Server modal ──────────────────────────────────────────────────────────
	let showServerModal = $state(false);
	let modalTab = $state<'explore' | 'create'>('explore');

	// Join
	let joinPasswordFor = $state('');
	let joinPassword = $state('');
	let joinError = $state('');
	let joinLoading = $state(false);

	// Create
	let newName = $state('');
	let newSlug = $state('');
	let newDesc = $state('');
	let newType = $state<'DISCORD' | 'SPATIAL'>('DISCORD');
	let newAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>('PUBLIC');
	let newPassword = $state('');
	let createLoading = $state(false);
	let createError = $state('');

	const ACCESS_ICON: Record<string, string> = { PUBLIC: '🌐', PASSWORD: '🔒', WHITELIST: '📋' };

	function closeModal() {
		showServerModal = false;
		joinPasswordFor = '';
		joinPassword = '';
		joinError = '';
		createError = '';
	}

	function handleJoin(slug: string, accessType: string) {
		if (accessType === 'PASSWORD') { joinPasswordFor = slug; return; }
		doJoin(slug);
	}

	async function doJoin(slug: string, password?: string) {
		joinError = '';
		joinLoading = true;
		try {
			const res = await fetch(`/api/servers/${slug}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(password ? { password } : {}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				joinError = err.message ?? 'No se pudo acceder.';
				return;
			}
			closeModal();
			await invalidateAll();
			goto(`/servers/${slug}`);
		} finally {
			joinLoading = false;
		}
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		createError = '';
		createLoading = true;
		try {
			const res = await fetch('/api/servers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: newName,
					slug: newSlug,
					description: newDesc || undefined,
					serverType: newType,
					accessType: newAccess,
					password: newAccess === 'PASSWORD' ? newPassword : undefined,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				createError = err.message ?? 'Error al crear.';
				return;
			}
			const created = await res.json();
			closeModal();
			newName = ''; newSlug = ''; newDesc = ''; newAccess = 'PUBLIC'; newPassword = '';
			await invalidateAll();
			goto(`/servers/${created.slug}`);
		} catch {
			createError = 'Error de red.';
		} finally {
			createLoading = false;
		}
	}
</script>

{#if user}
	<div class="app-shell">
		<!-- Server rail -->
		<nav class="rail" aria-label="Servidores">
			<a
				href="/home"
				class="rail-btn home-btn"
				class:active={isHome}
				title="Inicio"
				aria-label="Inicio"
			>
				<span class="home-icon">M</span>
				{#if totalDmUnread > 0}
					<span class="rail-badge">{totalDmUnread > 9 ? '9+' : totalDmUnread}</span>
				{/if}
			</a>

			<div class="rail-separator"></div>

			{#each myServers as srv (srv.id)}
				<a
					href="/servers/{srv.slug}"
					class="rail-btn server-btn"
					class:active={isActiveServer(srv.slug)}
					title={srv.name}
					aria-label={srv.name}
				>
					{#if srv.iconUrl}
						<img src={srv.iconUrl} alt={srv.name} class="server-icon-img" />
					{:else}
						<span class="server-initial">{srv.name[0].toUpperCase()}</span>
					{/if}
					<div class="active-indicator"></div>
				</a>
			{/each}

			<button
				class="rail-btn add-btn"
				title="Añadir o crear servidor"
				aria-label="Añadir servidor"
				onclick={() => { showServerModal = true; modalTab = isAdmin ? 'create' : 'explore'; }}
			>
				<span class="add-icon">+</span>
			</button>

			<div class="rail-spacer"></div>

			<ProfileMenu />
		</nav>

		<div class="app-content">
			{@render children()}
		</div>
	</div>

	<!-- Server modal -->
	{#if showServerModal}
		<div class="modal-overlay" role="dialog" aria-modal="true">
			<div class="server-modal">
				<div class="modal-header">
					<div class="modal-tabs">
						<button class="modal-tab" class:active={modalTab === 'explore'} onclick={() => (modalTab = 'explore')}>
							Explorar
						</button>
						{#if isAdmin}
							<button class="modal-tab" class:active={modalTab === 'create'} onclick={() => (modalTab = 'create')}>
								Crear servidor
							</button>
						{/if}
					</div>
					<button class="close-btn" onclick={closeModal} aria-label="Cerrar">✕</button>
				</div>

				{#if modalTab === 'explore'}
					<div class="modal-body">
						{#if joinPasswordFor}
							<div class="password-prompt">
								<h4>Contraseña para <strong>{joinPasswordFor}</strong></h4>
								<input type="password" bind:value={joinPassword} placeholder="Contraseña" autofocus />
								{#if joinError}<p class="error">{joinError}</p>{/if}
								<div class="prompt-actions">
									<button class="btn-ghost" onclick={() => { joinPasswordFor = ''; joinPassword = ''; joinError = ''; }}>Cancelar</button>
									<button class="btn-primary" disabled={joinLoading} onclick={() => doJoin(joinPasswordFor, joinPassword)}>
										{joinLoading ? '…' : 'Entrar'}
									</button>
								</div>
							</div>
						{:else if otherServers.length === 0}
							<p class="empty-modal">Ya eres miembro de todos los servidores disponibles.</p>
						{:else}
							{#if joinError}<p class="error">{joinError}</p>{/if}
							<div class="server-list">
								{#each otherServers as srv (srv.id)}
									<div class="server-row">
										<div class="srv-icon">
											{#if srv.iconUrl}
												<img src={srv.iconUrl} alt={srv.name} />
											{:else}
												<span>{srv.name[0].toUpperCase()}</span>
											{/if}
										</div>
										<div class="srv-info">
											<div class="srv-name">{srv.name}</div>
											{#if srv.description}<div class="srv-desc">{srv.description}</div>{/if}
											<div class="srv-meta">{ACCESS_ICON[srv.accessType]} · {srv._count?.members ?? 0} miembros</div>
										</div>
										<button
											class="btn-primary btn-sm"
											disabled={joinLoading}
											onclick={() => handleJoin(srv.slug, srv.accessType)}
										>
											Entrar
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<form class="modal-body create-form" onsubmit={handleCreate}>
						<div class="form-row">
							<label>
								Nombre
								<input type="text" bind:value={newName} required placeholder="Mi servidor" />
							</label>
							<label>
								Slug
								<input
									type="text"
									bind:value={newSlug}
									required
									pattern="[a-z0-9-]+"
									placeholder="mi-servidor"
									oninput={(e) => { newSlug = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); }}
								/>
							</label>
						</div>
						<label class="full">
							Descripción
							<input type="text" bind:value={newDesc} placeholder="Opcional" />
						</label>

						<div class="type-options">
							<button type="button" class="type-opt" class:selected={newType === 'DISCORD'} onclick={() => (newType = 'DISCORD')}>
								<span>💬</span> Discord
							</button>
							<button type="button" class="type-opt" class:selected={newType === 'SPATIAL'} onclick={() => (newType = 'SPATIAL')}>
								<span>🗺️</span> Espacial <span class="wip">WIP</span>
							</button>
						</div>

						<div class="form-row">
							<label>
								Acceso
								<select bind:value={newAccess}>
									<option value="PUBLIC">Público</option>
									<option value="PASSWORD">Contraseña</option>
									<option value="WHITELIST">Lista blanca</option>
								</select>
							</label>
							{#if newAccess === 'PASSWORD'}
								<label>
									Contraseña
									<input type="password" bind:value={newPassword} required />
								</label>
							{/if}
						</div>

						{#if createError}<p class="error">{createError}</p>{/if}
						<button type="submit" class="btn-primary" disabled={createLoading}>
							{createLoading ? 'Creando…' : 'Crear servidor'}
						</button>
					</form>
				{/if}
			</div>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.app-shell {
		display: flex;
		height: 100dvh;
		overflow: hidden;
		background: var(--bg-base);
	}

	/* ── Rail ── */
	.rail {
		width: 72px;
		flex-shrink: 0;
		background: var(--bg-elevated);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 0 0.5rem;
		gap: 0.25rem;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
	}

	.rail::-webkit-scrollbar { display: none; }

	.rail-separator {
		width: 32px;
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
		flex-shrink: 0;
	}

	.rail-spacer { flex: 1; }

	.rail-btn {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-radius 0.15s ease, background 0.15s ease;
		flex-shrink: 0;
		text-decoration: none;
		border: none;
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-family: inherit;
		overflow: visible;
	}

	.rail-btn:hover {
		border-radius: var(--radius-lg);
		background: var(--accent);
		color: var(--accent-text);
	}

	.rail-btn.active {
		border-radius: var(--radius-lg);
		background: var(--accent);
		color: var(--accent-text);
	}

	/* clip overflow for icons inside */
	.server-btn { overflow: hidden; }

	.active-indicator {
		position: absolute;
		left: -4px;
		top: 50%;
		transform: translateY(-50%) scaleY(0);
		width: 4px;
		height: 8px;
		border-radius: 0 2px 2px 0;
		background: var(--text-primary);
		transition: transform 0.15s ease, height 0.15s ease;
	}

	.rail-btn.active .active-indicator {
		transform: translateY(-50%) scaleY(1);
		height: 40px;
	}

	.home-btn {
		background: var(--accent);
		color: var(--accent-text);
		overflow: visible;
	}

	.home-btn:hover { border-radius: var(--radius-lg); }

	.home-icon {
		font-size: 1.3rem;
		font-weight: 900;
		letter-spacing: -0.05em;
	}

	.rail-badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		background: var(--error);
		color: #fff;
		font-size: 0.58rem;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
		border: 2px solid var(--bg-elevated);
		pointer-events: none;
	}

	.server-icon-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.server-initial {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-secondary);
	}

	.add-btn {
		background: var(--bg-surface);
		border: 2px dashed var(--border-strong);
	}

	.add-btn:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.add-icon {
		font-size: 1.4rem;
		font-weight: 300;
		line-height: 1;
	}

	.app-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* ── Server modal ── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 500;
	}

	.server-modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		width: 520px;
		max-width: calc(100vw - 2rem);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		padding: 0.75rem 1rem 0;
		border-bottom: 1px solid var(--border);
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.modal-tabs { display: flex; gap: 0.25rem; flex: 1; }

	.modal-tab {
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: color var(--transition), border-color var(--transition);
		margin-bottom: -1px;
	}

	.modal-tab:hover { color: var(--text-secondary); }
	.modal-tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }

	.close-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.25rem 0.35rem;
		border-radius: var(--radius-sm);
		line-height: 1;
		transition: color var(--transition), background var(--transition);
	}

	.close-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.modal-body {
		padding: 1rem;
		overflow-y: auto;
		flex: 1;
	}

	.empty-modal { font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 0; }

	/* ── Server list ── */
	.server-list { display: flex; flex-direction: column; gap: 0.4rem; }

	.server-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		transition: border-color var(--transition);
	}

	.server-row:hover { border-color: var(--border-strong); }

	.srv-icon {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-lg);
		background: var(--bg-base);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text-muted);
		flex-shrink: 0;
		overflow: hidden;
	}

	.srv-icon img { width: 100%; height: 100%; object-fit: cover; }

	.srv-info { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
	.srv-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
	.srv-desc { font-size: 0.72rem; color: var(--text-secondary); }
	.srv-meta { font-size: 0.68rem; color: var(--text-muted); }

	/* ── Create form ── */
	.create-form { display: flex; flex-direction: column; gap: 0.75rem; }

	.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		font-size: 0.72rem;
		color: var(--text-secondary);
		flex: 1;
		min-width: 140px;
	}

	label.full { flex: 1 1 100%; }

	input, select {
		font-size: 0.82rem;
		padding: 0.38rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		transition: border-color var(--transition);
		font-family: inherit;
	}

	input:focus, select:focus { border-color: var(--border-focus); }

	.type-options { display: flex; gap: 0.5rem; }

	.type-opt {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-secondary);
		transition: border-color var(--transition), background var(--transition), color var(--transition);
		position: relative;
	}

	.type-opt:hover { border-color: var(--border-strong); color: var(--text-primary); }
	.type-opt.selected { border-color: var(--accent); background: rgba(99,102,241,0.08); color: var(--text-primary); }

	.wip {
		font-size: 0.6rem;
		padding: 0.05rem 0.3rem;
		background: rgba(251,191,36,0.15);
		color: #fbbf24;
		border: 1px solid rgba(251,191,36,0.3);
		border-radius: 999px;
	}

	/* ── Password prompt ── */
	.password-prompt { display: flex; flex-direction: column; gap: 0.75rem; }
	.password-prompt h4 { font-size: 0.9rem; color: var(--text-primary); }
	.password-prompt h4 strong { color: var(--accent); }
	.prompt-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

	/* ── Shared ── */
	.btn-primary {
		font-size: 0.8rem;
		padding: 0.38rem 0.9rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 700;
		transition: opacity var(--transition);
		font-family: inherit;
		white-space: nowrap;
	}

	.btn-primary:hover:not(:disabled) { opacity: 0.85; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn-sm { padding: 0.28rem 0.65rem; font-size: 0.75rem; }

	.btn-ghost {
		font-size: 0.8rem;
		padding: 0.38rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
	}

	.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

	.error { font-size: 0.75rem; color: var(--error); }
</style>

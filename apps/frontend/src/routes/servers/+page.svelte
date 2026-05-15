<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	const { user } = data;

	let servers = $state(data.servers);
	let showCreate = $state(false);
	let createError = $state('');
	let createLoading = $state(false);

	let newName = $state('');
	let newSlug = $state('');
	let newDesc = $state('');
	let newType = $state<'DISCORD' | 'SPATIAL'>('DISCORD');
	let newAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>('PUBLIC');
	let newPassword = $state('');

	let joinPasswordFor = $state('');
	let joinPassword = $state('');
	let joinError = $state('');

	const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

	async function doJoin(slug: string, password?: string) {
		joinError = '';
		const res = await fetch(`/api/servers/${slug}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(password ? { password } : {}),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			joinError = err.message ?? 'No se pudo acceder al servidor.';
			return;
		}
		goto(`/servers/${slug}`);
	}

	function handleJoin(slug: string, accessType: string) {
		if (accessType === 'PASSWORD') { joinPasswordFor = slug; return; }
		doJoin(slug);
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
			goto(`/servers/${created.slug}`);
		} catch {
			createError = 'Error de red.';
		} finally {
			createLoading = false;
		}
	}

	const ACCESS_ICON: Record<string, string> = { PUBLIC: '🌐', PASSWORD: '🔒', WHITELIST: '📋' };
	const ACCESS_LABEL: Record<string, string> = { PUBLIC: 'Público', PASSWORD: 'Contraseña', WHITELIST: 'Lista blanca' };
</script>

<svelte:head><title>Meado — Servidores</title></svelte:head>

<div class="page">
	<header class="page-header">
		<span class="logo">meado</span>
		{#if isAdmin}
			<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
				{showCreate ? 'Cancelar' : '+ Nuevo servidor'}
			</button>
		{/if}
	</header>

	{#if showCreate}
		<form class="create-form" onsubmit={handleCreate}>
			<h3>Crear servidor</h3>
			<div class="form-row">
				<label>Nombre<input type="text" bind:value={newName} required /></label>
				<label>
					Slug
					<input type="text" bind:value={newSlug} required pattern="[a-z0-9-]+" placeholder="mi-servidor"
						oninput={(e) => { newSlug = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); }} />
				</label>
			</div>
			<label class="full">Descripción<input type="text" bind:value={newDesc} /></label>

			<div class="type-selector">
				<div class="type-label">Tipo de servidor</div>
				<div class="type-options">
					<button
						type="button"
						class="type-option"
						class:selected={newType === 'DISCORD'}
						onclick={() => (newType = 'DISCORD')}
					>
						<span class="type-icon">💬</span>
						<span class="type-name">Discord</span>
						<span class="type-desc">Canales de texto y voz</span>
					</button>
					<button
						type="button"
						class="type-option"
						class:selected={newType === 'SPATIAL'}
						onclick={() => (newType = 'SPATIAL')}
					>
						<span class="type-icon">🗺️</span>
						<span class="type-name">Espacial 2D</span>
						<span class="type-desc">Próximamente</span>
						<span class="type-badge">WIP</span>
					</button>
				</div>
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
					<label>Contraseña<input type="password" bind:value={newPassword} required /></label>
				{/if}
			</div>
			{#if createError}<p class="error">{createError}</p>{/if}
			<button type="submit" class="btn-primary" disabled={createLoading}>
				{createLoading ? 'Creando…' : 'Crear servidor'}
			</button>
		</form>
	{/if}

	{#if joinPasswordFor}
		<div class="modal-overlay" role="dialog" aria-modal="true">
			<div class="modal">
				<h4>Contraseña para <strong>{joinPasswordFor}</strong></h4>
				<input type="password" bind:value={joinPassword} placeholder="Contraseña" autofocus />
				{#if joinError}<p class="error">{joinError}</p>{/if}
				<div class="modal-actions">
					<button class="btn-ghost" onclick={() => { joinPasswordFor = ''; joinPassword = ''; joinError = ''; }}>Cancelar</button>
					<button class="btn-primary" onclick={() => doJoin(joinPasswordFor, joinPassword)}>Entrar</button>
				</div>
			</div>
		</div>
	{/if}

	<main class="content">
		<div class="section-label">SERVIDORES DISPONIBLES</div>

		{#if servers.length === 0}
			<p class="empty">No hay servidores disponibles.{#if isAdmin} Crea uno.{/if}</p>
		{:else}
			<div class="server-grid">
				{#each servers as srv (srv.id)}
					<div class="server-card">
						<div class="server-icon">
							{#if srv.iconUrl}
								<img src={srv.iconUrl} alt={srv.name} />
							{:else}
								<span class="icon-initials">{srv.name[0].toUpperCase()}</span>
							{/if}
						</div>
						<div class="server-info">
							<div class="server-name">{srv.name}</div>
							{#if srv.description}
								<div class="server-desc">{srv.description}</div>
							{/if}
							<div class="server-meta">
								<span>{ACCESS_ICON[srv.accessType]} {ACCESS_LABEL[srv.accessType]}</span>
								<span>· {srv._count.members} miembro{srv._count.members !== 1 ? 's' : ''}</span>
							</div>
						</div>
						<button class="btn-primary btn-sm" onclick={() => handleJoin(srv.slug, srv.accessType)}>
							Entrar
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		padding: 1.5rem 2rem;
		max-width: 860px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.logo {
		font-size: 1.2rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: var(--accent);
	}

	.section-label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}

	.server-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.server-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.85rem 1rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		transition: border-color var(--transition);
	}

	.server-card:hover { border-color: var(--border-strong); }

	.server-icon {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.server-icon img { width: 100%; height: 100%; object-fit: cover; }

	.icon-initials {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.server-info { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }

	.server-name { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }

	.server-desc { font-size: 0.75rem; color: var(--text-secondary); }

	.server-meta { font-size: 0.68rem; color: var(--text-muted); }

	.empty { font-size: 0.85rem; color: var(--text-muted); }

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		margin-bottom: 1.5rem;
	}

	h3 { font-size: 0.9rem; color: var(--text-secondary); }

	h4 { font-size: 0.9rem; color: var(--text-primary); margin-bottom: 0.5rem; }

	h4 strong { color: var(--accent); }

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

	select option { background: var(--bg-elevated); }

	.btn-primary {
		font-size: 0.8rem;
		padding: 0.4rem 0.9rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 700;
		transition: opacity var(--transition);
		font-family: inherit;
	}

	.btn-primary:hover:not(:disabled) { opacity: 0.85; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn-sm { padding: 0.3rem 0.7rem; font-size: 0.75rem; }

	.btn-ghost {
		font-size: 0.8rem;
		padding: 0.38rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		transition: border-color var(--transition), color var(--transition);
	}

	.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

	.error { font-size: 0.75rem; color: var(--error); }

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		min-width: 280px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

	.type-selector { display: flex; flex-direction: column; gap: 0.4rem; }

	.type-label {
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-weight: 600;
	}

	.type-options { display: flex; gap: 0.5rem; }

	.type-option {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.65rem 0.85rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: border-color var(--transition), background var(--transition);
		position: relative;
	}

	.type-option:hover { border-color: var(--border-strong); }
	.type-option.selected { border-color: var(--accent); background: rgba(99,102,241,0.08); }

	.type-icon { font-size: 1.1rem; }

	.type-name { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); }

	.type-desc { font-size: 0.7rem; color: var(--text-muted); }

	.type-badge {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.1rem 0.35rem;
		background: rgba(251,191,36,0.15);
		color: #fbbf24;
		border: 1px solid rgba(251,191,36,0.3);
		border-radius: 999px;
		letter-spacing: 0.05em;
	}
</style>

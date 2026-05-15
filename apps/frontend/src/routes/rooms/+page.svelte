<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';

	let { data } = $props();
	const { user, rooms: initialRooms } = data;

	let rooms = $state(initialRooms);
	let showCreate = $state(false);
	let createError = $state('');
	let createLoading = $state(false);

	let newName = $state('');
	let newSlug = $state('');
	let newDesc = $state('');
	let newAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>('PUBLIC');
	let newPassword = $state('');
	let newRadius = $state(500);
	let newMaxPlayers = $state(20);

	let joinSlug = $state('');
	let joinPassword = $state('');
	let joinError = $state('');

	async function handleJoin(slug: string, accessType: string) {
		if (accessType === 'PASSWORD') { joinSlug = slug; return; }
		await doJoin(slug);
	}

	async function doJoin(slug: string, password?: string) {
		joinError = '';
		try {
			const res = await fetch(`/api/rooms/${slug}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(password ? { password } : {}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				joinError = err.message ?? 'No se pudo acceder a la sala.';
				return;
			}
			goto(`/rooms/${slug}`);
		} catch {
			joinError = 'Error de red.';
		}
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		createError = '';
		createLoading = true;
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: newName,
					slug: newSlug,
					description: newDesc || undefined,
					accessType: newAccess,
					password: newAccess === 'PASSWORD' ? newPassword : undefined,
					proximityRadius: newRadius,
					maxPlayers: newMaxPlayers,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				createError = err.message ?? 'Error al crear la sala.';
				return;
			}
			const created = await res.json();
			rooms = [...rooms, { ...created, owner: { username: user.username } }];
			showCreate = false;
			newName = ''; newSlug = ''; newDesc = ''; newAccess = 'PUBLIC'; newPassword = '';
		} catch {
			createError = 'Error de red.';
		} finally {
			createLoading = false;
		}
	}

	const ACCESS_LABEL: Record<string, string> = {
		PUBLIC: 'Pública',
		PASSWORD: 'Contraseña',
		WHITELIST: 'Whitelist',
	};
</script>

<svelte:head><title>Meado — Salas</title></svelte:head>

<div class="page">
	<header class="hud">
		<span class="logo">meado</span>
	</header>

	<main class="content">
		<div class="section-header">
			<h2>Salas</h2>
			{#if user.role === 'ADMIN' || user.role === 'SUPERADMIN'}
				<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
					{showCreate ? 'Cancelar' : '+ Nueva sala'}
				</button>
			{/if}
		</div>

		{#if showCreate}
			<form class="create-form" onsubmit={handleCreate}>
				<h3>Crear sala</h3>
				<div class="form-row">
					<label>Nombre<input type="text" bind:value={newName} required /></label>
					<label>Slug<input type="text" bind:value={newSlug} required pattern="[a-z0-9-]+" placeholder="mi-sala" /></label>
				</div>
				<label class="full">Descripción<input type="text" bind:value={newDesc} /></label>
				<div class="form-row">
					<label>
						Acceso
						<select bind:value={newAccess}>
							<option value="PUBLIC">Pública</option>
							<option value="PASSWORD">Contraseña</option>
							<option value="WHITELIST">Whitelist</option>
						</select>
					</label>
					{#if newAccess === 'PASSWORD'}
						<label>Contraseña de sala<input type="password" bind:value={newPassword} required /></label>
					{/if}
				</div>
				<div class="form-row">
					<label>Radio de proximidad (px)<input type="number" bind:value={newRadius} min="100" max="2000" /></label>
					<label>Máx. jugadores<input type="number" bind:value={newMaxPlayers} min="2" max="100" /></label>
				</div>
				{#if createError}<p class="error">{createError}</p>{/if}
				<button type="submit" class="btn-primary" disabled={createLoading}>
					{createLoading ? 'Creando…' : 'Crear sala'}
				</button>
			</form>
		{/if}

		{#if joinSlug}
			<div class="join-modal">
				<p>Contraseña para <strong>{joinSlug}</strong>.</p>
				<input type="password" bind:value={joinPassword} placeholder="Contraseña" />
				{#if joinError}<p class="error">{joinError}</p>{/if}
				<div class="join-modal-actions">
					<button class="btn-ghost" onclick={() => { joinSlug = ''; joinPassword = ''; joinError = ''; }}>Cancelar</button>
					<button class="btn-primary" onclick={() => doJoin(joinSlug, joinPassword)}>Entrar</button>
				</div>
			</div>
		{/if}

		{#if rooms.length === 0}
			<p class="empty">No hay salas disponibles.{#if user.role === 'ADMIN' || user.role === 'SUPERADMIN'} Crea una.{/if}</p>
		{:else}
			<ul class="room-list">
				{#each rooms as room (room.id)}
					<li class="room-card">
						<div class="room-info">
							<span class="room-name">{room.name}</span>
							{#if room.description}
								<span class="room-desc">{room.description}</span>
							{/if}
							<span class="room-meta">
								{ACCESS_LABEL[room.accessType]} · {room.proximityRadius}px · máx. {room.maxPlayers}
							</span>
						</div>
						<button class="btn-primary btn-sm" onclick={() => handleJoin(room.slug, room.accessType)}>
							{room.accessType === 'PASSWORD' ? '🔒 Entrar' : 'Entrar'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		padding: 1rem;
		align-items: center;
	}

	.hud {
		display: flex;
		width: 100%;
		max-width: 700px;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: var(--accent);
	}

	.content {
		width: 100%;
		max-width: 700px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h2 {
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		color: var(--text-muted);
		text-transform: uppercase;
	}

	h3 {
		font-size: 0.9rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	.btn-primary {
		font-size: 0.8rem;
		padding: 0.38rem 0.8rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 700;
		transition: opacity var(--transition);
	}

	.btn-primary:hover:not(:disabled) { opacity: 0.88; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn-sm { padding: 0.28rem 0.65rem; font-size: 0.75rem; }

	.btn-ghost {
		font-size: 0.8rem;
		padding: 0.32rem 0.65rem;
		background: transparent;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		transition: border-color var(--transition), color var(--transition);
	}

	.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
	}

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
	}

	input:focus, select:focus { border-color: var(--border-focus); }

	select option { background: var(--bg-elevated); }

	.room-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }

	.room-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.85rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		transition: border-color var(--transition);
	}

	.room-card:hover { border-color: var(--border-strong); }

	.room-info { display: flex; flex-direction: column; gap: 0.22rem; }

	.room-name { font-size: 0.9rem; color: var(--text-primary); font-weight: 600; }

	.room-desc { font-size: 0.75rem; color: var(--text-secondary); }

	.room-meta { font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.05em; }

	.empty { font-size: 0.8rem; color: var(--text-muted); }

	.error { font-size: 0.75rem; color: var(--error); }

	.join-modal {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.1rem;
		border: 1px solid var(--border-focus);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		font-size: 0.85rem;
	}

	.join-modal strong { color: var(--accent); }

	.join-modal-actions { display: flex; gap: 0.5rem; }
</style>

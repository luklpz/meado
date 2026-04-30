<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';

	let { data } = $props();
	const { user, rooms: initialRooms } = data;

	let rooms = $state(initialRooms);
	let showCreate = $state(false);
	let createError = $state('');
	let createLoading = $state(false);

	// Campos del formulario de crear sala
	let newName = $state('');
	let newSlug = $state('');
	let newDesc = $state('');
	let newAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>('PUBLIC');
	let newPassword = $state('');
	let newRadius = $state(500);
	let newMaxPlayers = $state(20);

	// Formulario de join con contraseña
	let joinSlug = $state('');
	let joinPassword = $state('');
	let joinError = $state('');

	async function handleLogout() {
		await authStore.logout();
		goto('/login');
	}

	async function handleJoin(slug: string, accessType: string) {
		if (accessType === 'PASSWORD') {
			joinSlug = slug;
			return;
		}
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
				joinError = err.message ?? 'No se pudo acceder a la sala';
				return;
			}
			goto(`/rooms/${slug}`);
		} catch {
			joinError = 'Error de red';
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
				createError = err.message ?? 'Error al crear la sala';
				return;
			}
			const created = await res.json();
			rooms = [...rooms, { ...created, owner: { username: user.username } }];
			showCreate = false;
			newName = ''; newSlug = ''; newDesc = ''; newAccess = 'PUBLIC'; newPassword = '';
		} catch {
			createError = 'Error de red';
		} finally {
			createLoading = false;
		}
	}

	const ACCESS_LABEL: Record<string, string> = {
		PUBLIC: 'pública',
		PASSWORD: 'contraseña',
		WHITELIST: 'whitelist',
	};
</script>

<svelte:head><title>Meado — Salas</title></svelte:head>

<div class="page">
	<header class="hud">
		<span class="logo">meado</span>
		<div class="hud-right">
			<span class="username">{user.username}</span>
			{#if user.role === 'ADMIN' || user.role === 'SUPERADMIN'}
				<span class="badge">admin</span>
			{/if}
			<button class="btn-ghost" onclick={handleLogout}>salir</button>
		</div>
	</header>

	<main class="content">
		<div class="section-header">
			<h2>salas</h2>
			{#if user.role === 'ADMIN' || user.role === 'SUPERADMIN'}
				<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
					{showCreate ? 'cancelar' : '+ nueva sala'}
				</button>
			{/if}
		</div>

		{#if showCreate}
			<form class="create-form" onsubmit={handleCreate}>
				<h3>crear sala</h3>
				<div class="form-row">
					<label>nombre<input type="text" bind:value={newName} required /></label>
					<label>slug<input type="text" bind:value={newSlug} required pattern="[a-z0-9-]+" placeholder="mi-sala" /></label>
				</div>
				<label class="full">descripción<input type="text" bind:value={newDesc} /></label>
				<div class="form-row">
					<label>
						acceso
						<select bind:value={newAccess}>
							<option value="PUBLIC">pública</option>
							<option value="PASSWORD">contraseña</option>
							<option value="WHITELIST">whitelist</option>
						</select>
					</label>
					{#if newAccess === 'PASSWORD'}
						<label>contraseña sala<input type="password" bind:value={newPassword} required /></label>
					{/if}
				</div>
				<div class="form-row">
					<label>radio proximidad (px)<input type="number" bind:value={newRadius} min="100" max="2000" /></label>
					<label>máx. jugadores<input type="number" bind:value={newMaxPlayers} min="2" max="100" /></label>
				</div>
				{#if createError}<p class="error">{createError}</p>{/if}
				<button type="submit" class="btn-primary" disabled={createLoading}>
					{createLoading ? 'creando…' : 'crear'}
				</button>
			</form>
		{/if}

		{#if joinSlug}
			<div class="join-modal">
				<p>Contraseña para <strong>{joinSlug}</strong></p>
				<input type="password" bind:value={joinPassword} placeholder="contraseña" />
				{#if joinError}<p class="error">{joinError}</p>{/if}
				<div class="join-modal-actions">
					<button class="btn-ghost" onclick={() => { joinSlug = ''; joinPassword = ''; joinError = ''; }}>cancelar</button>
					<button class="btn-primary" onclick={() => doJoin(joinSlug, joinPassword)}>entrar</button>
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
								{ACCESS_LABEL[room.accessType]} · {room.proximityRadius}px · máx {room.maxPlayers}
							</span>
						</div>
						<button class="btn-primary btn-sm" onclick={() => handleJoin(room.slug, room.accessType)}>
							{room.accessType === 'WHITELIST' ? 'entrar' : room.accessType === 'PASSWORD' ? '🔒 entrar' : 'entrar'}
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
		background: #050d07;
		color: #d1fae5;
		font-family: monospace;
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

	.hud-right { display: flex; align-items: center; gap: 0.75rem; }

	.logo { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.15em; color: #22c55e; }

	.username { font-size: 0.8rem; color: #9ca3af; }

	.badge {
		font-size: 0.65rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid #22c55e;
		border-radius: 2px;
		color: #22c55e;
		letter-spacing: 0.05em;
	}

	.content { width: 100%; max-width: 700px; display: flex; flex-direction: column; gap: 1rem; }

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h2 { font-size: 0.85rem; letter-spacing: 0.1em; color: #6b7280; }
	h3 { font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5rem; }

	.btn-primary {
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.35rem 0.75rem;
		background: #22c55e;
		color: #050d07;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-weight: 700;
		transition: opacity 0.15s;
	}

	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-sm { padding: 0.25rem 0.6rem; font-size: 0.75rem; }

	.btn-ghost {
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
		background: transparent;
		border: 1px solid #374151;
		border-radius: 3px;
		color: #6b7280;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-ghost:hover { border-color: #22c55e; color: #22c55e; }

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #1a3320;
		border-radius: 4px;
		background: #080f0a;
	}

	.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: #6b7280;
		flex: 1;
		min-width: 140px;
	}

	label.full { flex: 1 1 100%; }

	input, select {
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.35rem 0.5rem;
		background: #0a1a0f;
		border: 1px solid #1a3320;
		border-radius: 3px;
		color: #d1fae5;
		outline: none;
	}

	input:focus, select:focus { border-color: #22c55e; }

	.room-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }

	.room-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border: 1px solid #1a3320;
		border-radius: 4px;
		background: #080f0a;
		transition: border-color 0.15s;
	}

	.room-card:hover { border-color: #22c55e33; }

	.room-info { display: flex; flex-direction: column; gap: 0.2rem; }

	.room-name { font-size: 0.9rem; color: #d1fae5; font-weight: 600; }

	.room-desc { font-size: 0.75rem; color: #6b7280; }

	.room-meta { font-size: 0.65rem; color: #374151; letter-spacing: 0.05em; }

	.empty { font-size: 0.8rem; color: #374151; }

	.error { font-size: 0.75rem; color: #ef4444; }

	.join-modal {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #22c55e44;
		border-radius: 4px;
		background: #080f0a;
		font-size: 0.85rem;
	}

	.join-modal strong { color: #22c55e; }

	.join-modal-actions { display: flex; gap: 0.5rem; }
</style>

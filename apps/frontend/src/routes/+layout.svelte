<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import { authStore } from '$lib/auth.js';
	import { dmUnread, incrementUnread } from '$lib/dmStore.js';
	import { conversationsStore } from '$lib/conversationsStore.js';
	import UserStatusBar from '$lib/components/UserStatusBar.svelte';
	import { serverUnread, setServerUnread } from '$lib/serverUnread.js';
	import { socketStore } from '$lib/socket.js';
	import { playPing } from '$lib/ping.js';
	import { uploadStore, formatSpeed } from '$lib/uploadStore.svelte.js';
	import { activeVoice, closeActiveVoiceSocket } from '$lib/voiceStore.js';
	import { livekitStore } from '$lib/livekit.js';
	import { get } from 'svelte/store';
	import { X, Check, MessageSquare, Map, Globe, Lock, ClipboardList, PhoneOff, Volume2, Search, Users } from 'lucide-svelte';

	let { data, children } = $props();

	// Nota arquitectura: con el modelo de Durable Objects, la conexión de
	// sesión recibe automáticamente dm:message:created/dm:conversation:joined
	// para TODAS las conversaciones del usuario (el servidor las descubre por
	// su cuenta consultando los miembros) — ya no hace falta re-unirse a cada
	// sala de DM en cada conexión/reconexión (antes: joinAllDmRooms +
	// onSocketReconnect). Esa parte del gateway anterior desaparece.
	function handleGlobalDm(msg: any) {
		if (!user) return;
		// Always update sidebar last message (own + others)
		conversationsStore.updateLastMessage(msg.conversationId, {
			content: msg.content,
			createdAt: msg.createdAt,
			author: msg.author,
		});
		if (msg.author?.id === user.id) return;
		if ($page.url.pathname === `/home/dm/${msg.conversationId}`) return;
		incrementUnread(msg.conversationId);
		// On /home* only ping when hidden; on other pages always ping
		if (!$page.url.pathname.startsWith('/home') || document.hidden) playPing();
		if (document.hidden && Notification.permission === 'granted') {
			const displayName = msg.author?.name ?? msg.author?.username ?? 'Alguien';
			new Notification(`Mensaje de ${displayName}`, {
				body: msg.content ?? 'Archivo adjunto',
				icon: msg.author?.avatarUrl ?? '/favicon.png',
				tag: `dm-${msg.conversationId}`,
			});
		}
	}

	function handleConversationJoined(d: { conversationId: string; conversation: any }) {
		if (d.conversation) conversationsStore.add(d.conversation);
	}

	function leaveActiveVoice() {
		const av = get(activeVoice);
		if (!av) return;
		closeActiveVoiceSocket();
		livekitStore.disconnect();
		activeVoice.set(null);
	}

	onMount(() => {
		authStore.init();
		if (user && typeof Notification !== 'undefined' && Notification.permission === 'default') {
			Notification.requestPermission().catch(() => {});
		}

		window.addEventListener('beforeunload', leaveActiveVoice);
		// Seed server unread badges from server-loaded data
		const initialUnread = (data as any).serverUnread as Record<string, number> | undefined;
		if (initialUnread) {
			for (const [id, count] of Object.entries(initialUnread)) setServerUnread(id, count);
		}
		socketStore.on('dm:message:created', handleGlobalDm);
		socketStore.on('dm:conversation:joined', handleConversationJoined);
	});

	onDestroy(() => {
		socketStore.off('dm:message:created', handleGlobalDm);
		socketStore.off('dm:conversation:joined', handleConversationJoined);
		if (browser) window.removeEventListener('beforeunload', leaveActiveVoice);
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
	let discoverSearch = $state('');

	const filteredServers = $derived(
		discoverSearch.trim()
			? otherServers.filter((s: any) =>
				(s.name + ' ' + (s.description ?? '')).toLowerCase().includes(discoverSearch.toLowerCase()))
			: otherServers
	);

	function srvBannerColor(srv: any): string {
		let h = 0;
		for (let i = 0; i < srv.name.length; i++) h = (h * 31 + srv.name.charCodeAt(i)) % 360;
		return `linear-gradient(125deg, oklch(0.62 0.13 ${h}), oklch(0.52 0.14 ${(h + 18) % 360}))`;
	}

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

	const ACCESS_ICON: Record<string, any> = { PUBLIC: Globe, PASSWORD: Lock, WHITELIST: ClipboardList };

	function closeModal() {
		showServerModal = false;
		modalTab = 'explore';
		discoverSearch = '';
		joinPasswordFor = '';
		joinPassword = '';
		joinError = '';
		createError = '';
		newType = 'DISCORD';
		newSlug = '';
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
				class="rail-btn rail-home"
				class:active={isHome}
				title="Inicio"
				aria-label="Inicio"
			>
				<span class="rail-pip"></span>
				<span class="home-icon">m</span>
				{#if totalDmUnread > 0}
					<span class="rail-badge">{totalDmUnread > 9 ? '9+' : totalDmUnread}</span>
				{/if}
			</a>

			<div class="rail-sep"></div>

			{#each myServers as srv (srv.id)}
				{@const srvUnread = $serverUnread.get(srv.id) ?? 0}
				<a
					href="/servers/{srv.slug}"
					class="rail-btn"
					class:active={isActiveServer(srv.slug)}
					title={srv.name}
					aria-label={srv.name}
				>
					<span class="rail-pip"></span>
					<div class="server-icon-clip">
						{#if srv.iconUrl}
							<img src={srv.iconUrl} alt={srv.name} class="server-icon-img" />
						{:else}
							<span class="server-initial">{srv.name[0].toUpperCase()}</span>
						{/if}
					</div>
					{#if srvUnread > 0 && !isActiveServer(srv.slug)}
						<span class="rail-badge">{srvUnread > 9 ? '9+' : srvUnread}</span>
					{/if}
				</a>
			{/each}

			<button
				class="rail-btn rail-add"
				title="Añadir o crear servidor"
				aria-label="Añadir servidor"
				onclick={() => { showServerModal = true; modalTab = isAdmin ? 'create' : 'explore'; }}
			>
				<span class="rail-pip"></span>
				<span class="add-icon">+</span>
			</button>

		</nav>

		<div class="app-content">
			{@render children()}
		</div>
	</div>

	<UserStatusBar />

	<!-- Global voice HUD -->
	{#if $activeVoice}
		<div class="voice-hud">
			<span class="voice-hud-icon"><Volume2 size={14} /></span>
			<div class="voice-hud-info">
				<span class="voice-hud-channel">{$activeVoice.channelName}</span>
				<span class="voice-hud-server">{$activeVoice.serverName}</span>
			</div>
			<a href="/servers/{$activeVoice.serverSlug}" class="voice-hud-link">Volver</a>
			<button class="voice-hud-leave" onclick={leaveActiveVoice} title="Salir de la llamada"><PhoneOff size={14} /></button>
		</div>
	{/if}

	<!-- Global upload tray -->
	{#if uploadStore.list.length > 0}
		<div class="upload-tray">
			{#each uploadStore.list as u (u.id)}
				<div class="upload-item" class:upload-done={u.done && !u.error} class:upload-error={!!u.error}>
					<div class="upload-header">
						<span class="upload-filename" title={u.filename}>{u.filename}</span>
						{#if u.done || u.error}
							<button class="upload-close" onclick={() => uploadStore.remove(u.id)} aria-label="Cerrar"><X size={16} /></button>
						{/if}
					</div>
					{#if !u.done && !u.error}
						<div class="upload-bar">
							<div class="upload-fill" style="width: {u.progress}%"></div>
						</div>
						<div class="upload-meta">
							<span>{u.resuming ? 'Reanudando...' : 'Subiendo...'} {u.progress}%</span>
							{#if u.speed > 0}<span class="upload-speed">{formatSpeed(u.speed)}</span>{/if}
						</div>
					{:else if u.done && !u.error}
						<p class="upload-status-ok"><Check size={14} /> Subido</p>
					{:else}
						<p class="upload-status-err">{u.error}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Server modal -->
	{#if showServerModal}
		<div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }} onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }}>
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
					<button class="close-btn" onclick={closeModal} aria-label="Cerrar"><X size={16} /></button>
				</div>

				{#if modalTab === 'explore'}
					<div class="modal-body discover-body">
						{#if joinPasswordFor}
							<div class="password-prompt">
								<h4>Contraseña para <strong>{joinPasswordFor}</strong></h4>
								<!-- svelte-ignore a11y_autofocus -->
								<input type="password" bind:value={joinPassword} placeholder="Contraseña" autofocus />
								{#if joinError}<p class="error">{joinError}</p>{/if}
								<div class="prompt-actions">
									<button class="btn-ghost" onclick={() => { joinPasswordFor = ''; joinPassword = ''; joinError = ''; }}>Cancelar</button>
									<button class="btn-primary" disabled={joinLoading} onclick={() => doJoin(joinPasswordFor, joinPassword)}>
										{joinLoading ? '…' : 'Entrar'}
									</button>
								</div>
							</div>
						{:else}
							<div class="discover-hero">
								<h3>Encuentra tu sitio</h3>
								<p>Comunidades con cariño. Entra a curiosear.</p>
								<div class="discover-search">
									<Search size={17} />
									<input bind:value={discoverSearch} placeholder="Busca un servidor…" />
								</div>
							</div>
							{#if joinError}<p class="error">{joinError}</p>{/if}
							{#if filteredServers.length === 0}
								<p class="empty-modal">{otherServers.length === 0 ? (myServers.length === 0 ? 'No hay servidores disponibles. Pide a un administrador que cree uno.' : 'Ya eres miembro de todos los servidores disponibles.') : 'Sin resultados para esa búsqueda.'}</p>
							{:else}
								<div class="discover-grid">
									{#each filteredServers as srv (srv.id)}
										{@const AccessIcon = ACCESS_ICON[srv.accessType]}
										<div class="disc-card">
											<div class="disc-banner" style="background:{srvBannerColor(srv)}"></div>
											<div class="disc-icon-wrap">
												{#if srv.iconUrl}
													<img src={srv.iconUrl} alt={srv.name} class="disc-icon-img" />
												{:else}
													<span class="disc-icon" style="background:{srvBannerColor(srv)}">{srv.name[0].toUpperCase()}</span>
												{/if}
											</div>
											<div class="disc-body">
												<div class="disc-name">{srv.name}</div>
												<div class="disc-desc">{srv.description ?? ''}</div>
												<div class="disc-foot">
													<span class="disc-meta"><Users size={11} /> {srv._count?.members ?? 0} miembros</span>
													<button
														class="btn-primary btn-sm"
														disabled={joinLoading}
														onclick={() => handleJoin(srv.slug, srv.accessType)}
													>
														<AccessIcon size={11} /> Entrar
													</button>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
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
								<span><MessageSquare size={16} /></span> Discord
							</button>
							<button type="button" class="type-opt" class:selected={newType === 'SPATIAL'} onclick={() => (newType = 'SPATIAL')}>
								<span><Map size={16} /></span> Espacial
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
		padding: 0.85rem 0 60px;
		gap: 0.5rem;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
	}

	.rail::-webkit-scrollbar { display: none; }

	.rail-sep {
		width: 30px;
		height: 2px;
		background: var(--border);
		border-radius: 2px;
		flex-shrink: 0;
	}

	.rail-btn {
		position: relative;
		width: 46px;
		height: 46px;
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		text-decoration: none;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		overflow: visible;
		transition:
			border-radius var(--transition) var(--ease-bounce),
			background var(--transition),
			color var(--transition),
			transform var(--transition);
	}

	.rail-btn:hover {
		transform: translateY(-2px);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
	}

	.rail-btn.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	/* Rail active pip indicator */
	.rail-pip {
		position: absolute;
		left: -10px;
		top: 50%;
		transform: translateY(-50%) scaleY(0);
		width: 5px;
		height: 22px;
		border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
		background: var(--text-primary);
		transition: transform var(--transition) var(--ease-bounce);
		pointer-events: none;
	}

	.rail-btn:hover .rail-pip { transform: translateY(-50%) scaleY(0.5); }
	.rail-btn.active .rail-pip { transform: translateY(-50%) scaleY(1); }

	/* Home button */
	.rail-home {
		background: linear-gradient(145deg, var(--accent), var(--accent-strong));
		color: var(--accent-text);
		font-family: var(--font-mono);
		font-weight: 800;
		font-size: 1.4rem;
	}

	.rail-home:hover { background: linear-gradient(145deg, var(--accent), var(--accent-strong)); }

	.home-icon {
		font-family: var(--font-mono);
		font-size: 1.4rem;
		font-weight: 800;
		transform: translateY(-1px);
	}

	/* Server icon inside button */
	.server-icon-clip {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.server-icon-img { width: 100%; height: 100%; object-fit: cover; }

	.server-initial {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-secondary);
	}

	/* Add server button */
	.rail-add {
		background: var(--accent-dim);
		border: 2px dashed var(--accent);
		color: var(--accent);
		font-size: 1.5rem;
		font-weight: 300;
	}

	.rail-add:hover {
		background: var(--accent);
		color: var(--accent-text);
		border-style: solid;
	}

	.add-icon {
		font-size: 1.5rem;
		font-weight: 300;
		line-height: 1;
	}

	.rail-badge {
		position: absolute;
		bottom: -3px;
		right: -3px;
		min-width: 20px;
		height: 20px;
		background: var(--error);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 800;
		border-radius: var(--radius-pill);
		display: grid;
		place-items: center;
		padding: 0 5px;
		border: 3px solid var(--bg-elevated);
		pointer-events: none;
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
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 500;
		padding: 1rem;
	}

	.server-modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		width: 720px;
		max-width: 100%;
		max-height: min(88vh, 640px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: var(--shadow-pop);
	}

	.modal-header {
		display: flex;
		align-items: center;
		padding: 1rem 1.1rem 0.7rem;
		border-bottom: 1px solid var(--border);
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.modal-tabs { display: flex; gap: 0.3rem; flex: 1; }

	.modal-tab {
		padding: 0.4rem 0.8rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		font-family: inherit;
		transition: color var(--transition), background var(--transition);
	}

	.modal-tab:hover { color: var(--text-secondary); }
	.modal-tab.active { background: var(--accent-dim); color: var(--accent); }

	.close-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: var(--bg-elevated);
		color: var(--text-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: background var(--transition), color var(--transition);
		flex-shrink: 0;
	}

	.close-btn:hover { background: var(--error-surface); color: var(--error); }

	.modal-body {
		padding: 1.1rem;
		overflow-y: auto;
		flex: 1;
	}

	.empty-modal { font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 0; }

	/* ── Discover (explore tab) ── */
	.discover-body { display: flex; flex-direction: column; gap: 1rem; }
	.discover-hero { padding: 0.3rem 0.2rem 0; }
	.discover-hero h3 { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
	.discover-hero p { font-size: 0.84rem; color: var(--text-muted); margin: 0.2rem 0 0.9rem; }
	.discover-search {
		display: flex; align-items: center; gap: 0.6rem;
		padding: 0.7rem 1rem; background: var(--bg-elevated);
		border: 1.5px solid var(--border); border-radius: var(--radius-pill);
	}
	.discover-search :global(svg) { color: var(--text-muted); flex-shrink: 0; }
	.discover-search input {
		flex: 1; background: transparent; border: none; outline: none;
		font-size: 0.88rem; color: var(--text-primary); font-family: inherit;
	}
	.discover-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
	.disc-card {
		background: var(--bg-base); border: 1px solid var(--border);
		border-radius: var(--radius-lg); overflow: hidden;
		transition: border-color var(--transition), transform var(--transition);
		position: relative;
	}
	.disc-card:hover { border-color: var(--accent); transform: translateY(-2px); }
	.disc-banner { height: 64px; }
	.disc-icon-wrap { margin: -26px 0 0 0.9rem; position: relative; z-index: 1; display: inline-block; }
	.disc-icon {
		width: 48px; height: 48px; border-radius: var(--radius); display: grid; place-items: center;
		color: #fff; font-family: var(--font-mono); font-weight: 800; font-size: 1.3rem;
		border: 3px solid var(--bg-base);
	}
	.disc-icon-img {
		width: 48px; height: 48px; border-radius: var(--radius); object-fit: cover;
		border: 3px solid var(--bg-base); display: block;
	}
	.disc-body { padding: 0.4rem 0.9rem 0.9rem; }
	.disc-name { font-size: 0.95rem; font-weight: 800; color: var(--text-primary); }
	.disc-desc { font-size: 0.76rem; color: var(--text-muted); line-height: 1.4; margin: 0.15rem 0 0.7rem; min-height: 2.1em; }
	.disc-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.disc-meta { display: flex; align-items: center; gap: 0.35rem; font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-secondary); }

	/* ── Create form ── */
	.create-form { display: flex; flex-direction: column; gap: 0.75rem; }

	.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-secondary);
		flex: 1;
		min-width: 140px;
	}

	label.full { flex: 1 1 100%; }

	input, select {
		font-size: 0.9rem;
		padding: 0.7rem 0.85rem;
		background: var(--bg-elevated);
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		transition: border-color var(--transition), box-shadow var(--transition);
		font-family: var(--font-ui);
		text-transform: none;
		letter-spacing: normal;
	}

	input::placeholder { color: var(--text-muted); }
	input:focus, select:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-dim);
	}

	.type-options { display: flex; gap: 0.5rem; }

	.type-opt {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.55rem 0.75rem;
		background: var(--bg-elevated);
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-secondary);
		transition: border-color var(--transition), background var(--transition), color var(--transition);
	}

	.type-opt:hover { border-color: var(--border-strong); color: var(--text-primary); }
	.type-opt.selected { border-color: var(--accent); background: var(--accent-dim); color: var(--text-primary); }

	/* ── Password prompt ── */
	.password-prompt { display: flex; flex-direction: column; gap: 0.75rem; }
	.password-prompt h4 { font-size: 0.9rem; color: var(--text-primary); font-family: var(--font-ui); }
	.password-prompt h4 strong { color: var(--accent); }
	.prompt-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

	/* ── Shared buttons ── */
	.btn-primary {
		font-size: 0.88rem;
		font-weight: 800;
		padding: 0.75rem 1rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-family: var(--font-ui);
		white-space: nowrap;
		transition: transform var(--transition) var(--ease-bounce), filter var(--transition);
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.btn-primary:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
	.btn-primary:active { transform: translateY(0) scale(0.98); }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
	.btn-sm { padding: 0.4rem 0.85rem; font-size: 0.76rem; border-radius: var(--radius-pill); }

	.btn-ghost {
		font-size: 0.88rem;
		font-weight: 700;
		padding: 0.75rem 1rem;
		background: transparent;
		border: 1.5px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-secondary);
		cursor: pointer;
		font-family: var(--font-ui);
		transition: border-color var(--transition), color var(--transition);
	}

	.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

	.error { font-size: 0.78rem; color: var(--error); }

	/* ── Global voice HUD ── */
	.voice-hud {
		position: fixed;
		bottom: 60px;
		left: 4px;
		z-index: 590;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 0.4rem 0.6rem;
		box-shadow: var(--shadow-sm);
		min-width: 180px;
		max-width: 240px;
	}

	.voice-hud-icon { color: var(--success); display: flex; align-items: center; flex-shrink: 0; }

	.voice-hud-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.voice-hud-channel {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.voice-hud-server {
		font-size: 0.62rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.voice-hud-link {
		font-size: 0.65rem;
		color: var(--accent);
		text-decoration: none;
		flex-shrink: 0;
		font-weight: 600;
	}

	.voice-hud-link:hover { text-decoration: underline; }

	.voice-hud-leave {
		background: none;
		border: none;
		color: var(--error);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 0.15rem;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition: background var(--transition);
	}

	.voice-hud-leave:hover { background: var(--error-surface); }

	/* ── Global upload tray ── */
	.upload-tray {
		position: fixed;
		bottom: 1.25rem;
		right: 1.25rem;
		z-index: 600;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 300px;
		pointer-events: none;
	}

	.upload-item {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 0.65rem 0.75rem;
		box-shadow: var(--shadow-card);
		pointer-events: all;
		transition: border-color 0.2s;
	}

	.upload-item.upload-done { border-color: var(--success-border); }
	.upload-item.upload-error { border-color: var(--error); }

	.upload-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.upload-filename {
		flex: 1;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.upload-close {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.72rem;
		padding: 0.1rem 0.25rem;
		border-radius: var(--radius-sm);
		line-height: 1;
		flex-shrink: 0;
	}

	.upload-close:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.upload-bar {
		height: 3px;
		background: var(--bg-elevated);
		border-radius: 9999px;
		overflow: hidden;
		margin-bottom: 0.35rem;
	}

	.upload-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 9999px;
		transition: width 0.25s ease;
	}

	.upload-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.upload-speed { color: var(--text-secondary); }

	.upload-status-ok {
		font-size: 0.75rem;
		color: var(--success);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.upload-status-err {
		font-size: 0.75rem;
		color: var(--error);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

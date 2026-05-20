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
	import type { ChatSocket } from '$lib/socket.js';
	import { playPing } from '$lib/ping.js';
	import { uploadStore, formatSpeed } from '$lib/uploadStore.svelte.js';
	import { activeVoice } from '$lib/voiceStore.js';
	import { livekitStore } from '$lib/livekit.js';
	import { get } from 'svelte/store';
	import { X, Check, MessageSquare, Map, Globe, Lock, ClipboardList, PhoneOff, Volume2 } from 'lucide-svelte';

	let { data, children } = $props();

	let _activeSock: ChatSocket | null = null;
	let _socketUnsub: (() => void) | null = null;

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
		if (_activeSock) _activeSock.emit('dm:join', { conversationId: d.conversationId });
		if (d.conversation) conversationsStore.add(d.conversation);
	}

	async function joinAllDmRooms(s: ChatSocket) {
		try {
			const res = await fetch('/api/dm', { credentials: 'include' });
			if (!res.ok) return;
			const convs: { id: string }[] = await res.json();
			for (const c of convs) s.emit('dm:join', { conversationId: c.id });
		} catch { /* non-critical */ }
	}

	function onSocketReconnect() {
		if (_activeSock && user) joinAllDmRooms(_activeSock);
	}

	function leaveActiveVoice() {
		const av = get(activeVoice);
		if (!av) return;
		const socket = _activeSock;
		socket?.emit('voice:leave', { channelId: av.channelId });
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
		_socketUnsub = socketStore.socket.subscribe(s => {
			if (s === _activeSock) return;
			if (_activeSock) {
				_activeSock.off('dm:message:created', handleGlobalDm);
				_activeSock.off('dm:conversation:joined', handleConversationJoined);
				_activeSock.off('connect', onSocketReconnect);
			}
			_activeSock = s;
			if (s) {
				s.on('dm:message:created', handleGlobalDm);
				s.on('dm:conversation:joined', handleConversationJoined);
				s.on('connect', onSocketReconnect);
				// Join DM rooms regardless of connection state — socket.io buffers pre-connect emits.
				// If already connected (socket was created by another page's onMount first), call now.
				if (user) joinAllDmRooms(s);
			}
		});
	});

	onDestroy(() => {
		_socketUnsub?.();
		if (_activeSock) {
			_activeSock.off('dm:message:created', handleGlobalDm);
			_activeSock.off('dm:conversation:joined', handleConversationJoined);
			_activeSock.off('connect', onSocketReconnect);
		}
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
				{@const srvUnread = $serverUnread.get(srv.id) ?? 0}
				<a
					href="/servers/{srv.slug}"
					class="rail-btn server-btn"
					class:active={isActiveServer(srv.slug)}
					title={srv.name}
					aria-label={srv.name}
				>
					<div class="server-icon-clip">
						{#if srv.iconUrl}
							<img src={srv.iconUrl} alt={srv.name} class="server-icon-img" />
						{:else}
							<span class="server-initial">{srv.name[0].toUpperCase()}</span>
						{/if}
					</div>
					<div class="active-indicator"></div>
					{#if srvUnread > 0 && !isActiveServer(srv.slug)}
						<span class="rail-badge">{srvUnread > 9 ? '9+' : srvUnread}</span>
					{/if}
				</a>
			{/each}

			<button
				class="rail-btn add-btn"
				class:add-btn-highlight={myServers.length === 0}
				title="Añadir o crear servidor"
				aria-label="Añadir servidor"
				onclick={() => { showServerModal = true; modalTab = isAdmin ? 'create' : 'explore'; }}
			>
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
					<div class="modal-body">
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
						{:else if otherServers.length === 0}
							<p class="empty-modal">{myServers.length === 0 ? 'No hay servidores disponibles. Pide a un administrador que cree uno.' : 'Ya eres miembro de todos los servidores disponibles.'}</p>
						{:else}
							{#if joinError}<p class="error">{joinError}</p>{/if}
							<div class="server-list">
								{#each otherServers as srv (srv.id)}
									{@const AccessIcon = ACCESS_ICON[srv.accessType]}
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
											<div class="srv-meta"><AccessIcon size={11} /> · {srv._count?.members ?? 0} miembros</div>
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
		width: 56px;
		flex-shrink: 0;
		background: var(--bg-elevated);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 0 56px;
		gap: 0.25rem;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
	}

	.rail::-webkit-scrollbar { display: none; }

	.rail-separator {
		width: 24px;
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
		flex-shrink: 0;
	}

	.rail-btn {
		position: relative;
		width: 36px;
		height: 36px;
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
	.server-btn { overflow: visible; }

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

	.add-btn-highlight {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.add-btn-highlight:hover {
		background: var(--accent);
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
	.srv-meta { display: flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; color: var(--text-muted); }

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

	/* ── Global voice HUD ── */
	.voice-hud {
		position: fixed;
		bottom: 56px;
		left: 4px;
		z-index: 590;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 0.4rem 0.6rem;
		box-shadow: 0 2px 10px rgba(0,0,0,0.3);
		min-width: 180px;
		max-width: 220px;
	}

	.voice-hud-icon { color: var(--success, #22c55e); display: flex; align-items: center; flex-shrink: 0; }

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
		color: var(--error, #ef4444);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 0.15rem;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition: background var(--transition);
	}

	.voice-hud-leave:hover { background: var(--error-surface, rgba(239,68,68,0.12)); }

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
		box-shadow: 0 4px 16px rgba(0,0,0,0.35);
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

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import type { ChatSocket } from '$lib/socket.js';
	import { dmUnread } from '$lib/dmStore.js';
	import { conversationsStore, type Conversation } from '$lib/conversationsStore.js';
	import { Users, MessageSquare, X, Check, Plus } from 'lucide-svelte';

	let { data } = $props();
	const user = $derived(data.user as { id: string; username: string; role: string; avatarUrl?: string | null });

	type Friend = { id: string; user: { id: string; username: string; name?: string | null; avatarUrl?: string | null; online: boolean } };
	type Pending = { id: string; direction: 'incoming' | 'outgoing'; user: { id: string; username: string; name?: string | null; avatarUrl?: string | null }; createdAt: string };

	// svelte-ignore state_referenced_locally
	let friends = $state<Friend[]>([...data.friends]);
	// svelte-ignore state_referenced_locally
	let pending = $state<Pending[]>([...data.pending]);

	let activeTab = $state<'online' | 'all' | 'pending' | 'add'>('online');
	let addIdentifier = $state('');
	let addError = $state('');
	let addSuccess = $state('');
	let addLoading = $state(false);
	let dmLoading = $state(false);
	let dmError = $state('');
	let searchQuery = $state('');
	let searchResults = $state<{ id: string; username: string; name?: string | null; avatarUrl?: string | null }[]>([]);
	let searching = $state(false);
	let searchDone = $state(false);

	// New DM modal
	let showNewDm = $state(false);

	let sock: ChatSocket | null = null;

	$effect(() => { conversationsStore.seed(data.conversations); });

	function handlePresence(data: { userId: string; online: boolean }) {
		friends = friends.map(f =>
			f.user.id === data.userId ? { ...f, user: { ...f.user, online: data.online } } : f
		);
	}

	function handleFriendRequest(data: { id: string; user: { id: string; username: string; avatarUrl?: string | null }; createdAt: string }) {
		if (pending.some(p => p.id === data.id)) return;
		pending = [...pending, { id: data.id, direction: 'incoming', user: data.user, createdAt: data.createdAt }];
	}

	onMount(() => {
		const token = authStore.getSocketToken();
		if (token) {
			sock = socketStore.connect(token);
			sock.on('presence:update', handlePresence);
			sock.on('friend:request', handleFriendRequest);
		}
	});

	onDestroy(() => {
		sock?.off('presence:update', handlePresence);
		sock?.off('friend:request', handleFriendRequest);
	});

	const onlineFriends = $derived(friends.filter(f => f.user.online));
	const incomingPending = $derived(pending.filter(p => p.direction === 'incoming'));
	const filteredConversations = $derived(
		searchQuery.trim()
			? $conversationsStore.filter(c =>
					(c.name ?? c.members.map(m => m.username).join('')).toLowerCase().includes(searchQuery.toLowerCase())
				)
			: $conversationsStore
	);

	async function searchUsers() {
		if (!addIdentifier.trim() || addIdentifier.trim().length < 2) return;
		addError = '';
		addSuccess = '';
		searching = true;
		searchDone = false;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(addIdentifier.trim())}`, { credentials: 'include' });
			if (res.ok) searchResults = await res.json();
			else searchResults = [];
			searchDone = true;
		} catch {
			searchResults = [];
			searchDone = true;
		} finally {
			searching = false;
		}
	}

	async function sendRequestToUser(userId: string, username: string) {
		const res = await fetch('/api/friends/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ identifier: username }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			addError = err.message ?? 'Error al enviar solicitud.';
			return;
		}
		const p = await res.json();
		addSuccess = `Solicitud enviada a ${username}.`;
		pending = [...pending, { id: p.id, direction: 'outgoing', user: p.receiver, createdAt: p.createdAt }];
		// Remove from results
		searchResults = searchResults.filter(u => u.id !== userId);
	}

	async function acceptFriend(friendshipId: string) {
		const res = await fetch(`/api/friends/accept/${friendshipId}`, { method: 'POST', credentials: 'include' });
		if (!res.ok) { addError = 'Error al aceptar la solicitud'; return; }
		const f = await res.json();
		pending = pending.filter(p => p.id !== friendshipId);
		friends = [...friends, { id: f.id, user: { ...f.sender, online: false } }];
	}

	async function removeFriend(friendshipId: string) {
		const res = await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE', credentials: 'include' });
		if (!res.ok) return;
		friends = friends.filter(f => f.id !== friendshipId);
		pending = pending.filter(p => p.id !== friendshipId);
	}

	async function openOrCreateDm(userId: string) {
		if (dmLoading) return;
		dmLoading = true;
		dmError = '';
		try {
			const res = await fetch('/api/dm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ userIds: [userId] }),
			});
			if (!res.ok) { dmError = 'No se pudo abrir la conversación'; return; }
			const conv = await res.json();
			goto(`/home/dm/${conv.id}`);
		} finally {
			dmLoading = false;
		}
	}

	function convName(conv: Conversation) {
		if (conv.name) return conv.name;
		const others = conv.members.filter(m => m.id !== user.id);
		return others.map(m => m.name || m.username).join(', ') || 'Conversación';
	}

	function convAvatar(conv: Conversation) {
		const others = conv.members.filter(m => m.id !== user.id);
		return others[0]?.avatarUrl ?? null;
	}

	function convInitial(conv: Conversation) {
		const others = conv.members.filter(m => m.id !== user.id);
		return ((others[0]?.name || others[0]?.username || '?')[0]).toUpperCase();
	}

	function formatTime(iso: string) {
		const d = new Date(iso);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
		return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
	}
</script>

<svelte:head><title>Meado — Inicio</title></svelte:head>

<div class="home-layout">
	<!-- DM/Friends sidebar -->
	<aside class="home-sidebar">
		<div class="search-bar">
			<input type="text" bind:value={searchQuery} placeholder="Buscar" oninput={() => {}} />
		</div>

		<button class="sidebar-nav-btn" onclick={() => (activeTab = 'online')}>
			<span class="nav-icon"><Users size={16} /></span>
			Amigos
			{#if incomingPending.length > 0}
				<span class="badge">{incomingPending.length}</span>
			{/if}
		</button>

		<div class="sidebar-section-header">
			<span>Mensajes directos</span>
			<button class="icon-btn" title="Nueva conversación" onclick={() => (showNewDm = true)}><Plus size={14} /></button>
		</div>

		<div class="dm-list">
			{#each filteredConversations as conv (conv.id)}
				{@const unread = $dmUnread.get(conv.id) ?? 0}
				<a href="/home/dm/{conv.id}" class="dm-item">
					<div class="dm-avatar">
						{#if convAvatar(conv)}
							<img src={convAvatar(conv)} alt="" />
						{:else}
							<span>{convInitial(conv)}</span>
						{/if}
					</div>
					<div class="dm-info">
						<div class="dm-name">{convName(conv)}</div>
						{#if conv.lastMessage}
							<div class="dm-last" class:dm-last-unread={unread > 0}>{conv.lastMessage.author.name || conv.lastMessage.author.username}: {conv.lastMessage.content ?? 'Archivo adjunto'}</div>
						{/if}
					</div>
					{#if unread > 0}
						<span class="dm-unread-badge">{unread > 9 ? '9+' : unread}</span>
					{:else if conv.lastMessage}
						<span class="dm-time">{formatTime(conv.lastMessage.createdAt)}</span>
					{/if}
				</a>
			{/each}
		</div>

	</aside>

	<!-- Main content -->
	<main class="home-main">
		<div class="friends-header">
			<span class="friends-title"><Users size={16} /> Amigos</span>
			<div class="tabs">
				<button class="tab" class:active={activeTab === 'online'} onclick={() => (activeTab = 'online')}>
					En línea
				</button>
				<button class="tab" class:active={activeTab === 'all'} onclick={() => (activeTab = 'all')}>
					Todos
				</button>
				<button class="tab" class:active={activeTab === 'pending'} onclick={() => (activeTab = 'pending')}>
					Pendiente
					{#if incomingPending.length > 0}<span class="tab-badge">{incomingPending.length}</span>{/if}
				</button>
				<button class="tab tab-add" class:active={activeTab === 'add'} onclick={() => (activeTab = 'add')}>
					Añadir amigo
				</button>
			</div>
		</div>

		<div class="friends-content">
			{#if dmError}<p class="error" style="margin-bottom:0.5rem">{dmError}</p>{/if}
			{#if activeTab === 'online'}
				<div class="section-label">EN LÍNEA — {onlineFriends.length}</div>
				{#if onlineFriends.length === 0}
					<div class="empty-state"><Users size={32} /><p>Nadie online.</p></div>
				{:else}
					{#each onlineFriends as f (f.id)}
						<div class="friend-row">
							<div class="friend-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt={f.user.username} />
								{:else}
									<span>{(f.user.name || f.user.username)[0].toUpperCase()}</span>
								{/if}
								<div class="status-dot online"></div>
							</div>
							<div class="friend-info">
								<span class="friend-name">{f.user.name || f.user.username}</span>
								<span class="friend-status">En línea</span>
							</div>
							<div class="friend-actions">
								<button class="icon-action" title="Mensaje" onclick={() => openOrCreateDm(f.user.id)}><MessageSquare size={14} /></button>
								<button class="icon-action danger" title="Eliminar" onclick={() => removeFriend(f.id)}><X size={14} /></button>
							</div>
						</div>
					{/each}
				{/if}

			{:else if activeTab === 'all'}
				<div class="section-label">TODOS LOS AMIGOS — {friends.length}</div>
				{#if friends.length === 0}
					<div class="empty-state"><Users size={32} /><p>Sin amigos todavía. Añade uno arriba.</p></div>
				{:else}
					{#each friends as f (f.id)}
						<div class="friend-row">
							<div class="friend-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt={f.user.username} />
								{:else}
									<span>{(f.user.name || f.user.username)[0].toUpperCase()}</span>
								{/if}
								<div class="status-dot" class:online={f.user.online}></div>
							</div>
							<div class="friend-info">
								<span class="friend-name">{f.user.name || f.user.username}</span>
								<span class="friend-status">{f.user.online ? 'En línea' : 'Desconectado'}</span>
							</div>
							<div class="friend-actions">
								<button class="icon-action" title="Mensaje" onclick={() => openOrCreateDm(f.user.id)}><MessageSquare size={14} /></button>
								<button class="icon-action danger" title="Eliminar" onclick={() => removeFriend(f.id)}><X size={14} /></button>
							</div>
						</div>
					{/each}
				{/if}

			{:else if activeTab === 'pending'}
				{#if pending.length === 0}
					<div class="empty-state"><Users size={32} /><p>Sin solicitudes pendientes.</p></div>
				{:else}
					{#if incomingPending.length > 0}
						<div class="section-label">ENTRANTES — {incomingPending.length}</div>
						{#each incomingPending as p (p.id)}
							<div class="friend-row">
								<div class="friend-avatar">
									{#if p.user.avatarUrl}
										<img src={p.user.avatarUrl} alt={p.user.username} />
									{:else}
										<span>{(p.user.name || p.user.username)[0].toUpperCase()}</span>
									{/if}
								</div>
								<div class="friend-info">
									<span class="friend-name">{p.user.name || p.user.username}</span>
									<span class="friend-status">Solicitud entrante</span>
								</div>
								<div class="friend-actions">
									<button class="icon-action success" title="Aceptar" onclick={() => acceptFriend(p.id)}><Check size={14} /></button>
									<button class="icon-action danger" title="Rechazar" onclick={() => removeFriend(p.id)}><X size={14} /></button>
								</div>
							</div>
						{/each}
					{/if}
					{#if pending.filter(p => p.direction === 'outgoing').length > 0}
						<div class="section-label">ENVIADAS</div>
						{#each pending.filter(p => p.direction === 'outgoing') as p (p.id)}
							<div class="friend-row">
								<div class="friend-avatar">
									{#if p.user.avatarUrl}
										<img src={p.user.avatarUrl} alt={p.user.username} />
									{:else}
										<span>{(p.user.name || p.user.username)[0].toUpperCase()}</span>
									{/if}
								</div>
								<div class="friend-info">
									<span class="friend-name">{p.user.name || p.user.username}</span>
									<span class="friend-status">Solicitud enviada</span>
								</div>
								<div class="friend-actions">
									<button class="icon-action danger" title="Cancelar" onclick={() => removeFriend(p.id)}><X size={14} /></button>
								</div>
							</div>
						{/each}
					{/if}
				{/if}

			{:else if activeTab === 'add'}
				<div class="add-friend-panel">
					<h3>Añadir amigo</h3>
					<p>Busca por username. Solo se puede añadir por username exacto.</p>
					<div class="add-form">
						<input
							type="text"
							bind:value={addIdentifier}
							placeholder="username"
							onkeydown={(e) => e.key === 'Enter' && searchUsers()}
						/>
						<button class="btn-primary" onclick={searchUsers} disabled={searching || addIdentifier.trim().length < 2}>
							{searching ? '…' : 'Buscar'}
						</button>
					</div>
					{#if addError}<p class="error">{addError}</p>{/if}
					{#if addSuccess}<p class="success">{addSuccess}</p>{/if}
					{#if searchDone}
						{#if searchResults.length === 0}
							<p class="search-empty">No se encontraron usuarios con ese username.</p>
						{:else}
							<ul class="search-results">
								{#each searchResults as u (u.id)}
									<li class="search-result-item">
										<div class="sr-avatar">
											{#if u.avatarUrl}
												<img src={u.avatarUrl} alt="" class="avatar-sm" />
											{:else}
												<div class="avatar-sm avatar-init">{(u.name || u.username)[0].toUpperCase()}</div>
											{/if}
										</div>
										<div class="sr-info">
											<span class="sr-name">{u.name || u.username}</span>
											<span class="sr-tag">@{u.username}</span>
										</div>
										<button class="btn-primary btn-sm" onclick={() => sendRequestToUser(u.id, u.username)}>
											Añadir
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

{#if showNewDm}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="new-dm-modal">
			<div class="new-dm-header">
				<h4>Nueva conversación</h4>
				<button class="close-btn" onclick={() => (showNewDm = false)}><X size={14} /></button>
			</div>
			{#if friends.length === 0}
				<p class="empty-modal">No tienes amigos todavía.</p>
			{:else}
				<div class="friend-pick-list">
					{#each friends as f (f.id)}
						<button
							class="friend-pick-row"
							disabled={dmLoading}
							onclick={() => { showNewDm = false; openOrCreateDm(f.user.id); }}
						>
							<div class="pick-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt="" />
								{:else}
									<span>{(f.user.name || f.user.username)[0].toUpperCase()}</span>
								{/if}
							</div>
							<span class="pick-name">{f.user.name || f.user.username}</span>
							<div class="pick-status" class:online={f.user.online}></div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.home-layout {
		display: flex;
		height: 100%;
		overflow: hidden;
	}

	.home-sidebar {
		width: 240px;
		flex-shrink: 0;
		background: var(--bg-surface);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dm-list {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		padding-bottom: 56px;
	}

	.search-bar {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.search-bar input {
		width: 100%;
		padding: 0.3rem 0.6rem;
		background: var(--bg-elevated);
		border: none;
		border-radius: var(--radius);
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: inherit;
		outline: none;
		box-sizing: border-box;
	}

	.search-bar input::placeholder { color: var(--text-muted); }

	.sidebar-nav-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: var(--radius);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		margin: 0.25rem 0.5rem;
		width: calc(100% - 1rem);
		transition: background var(--transition), color var(--transition);
	}

	.sidebar-nav-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.nav-icon { font-size: 1rem; }

	.badge {
		margin-left: auto;
		background: var(--error);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		min-width: 16px;
		text-align: center;
	}

	.sidebar-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.dm-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.5rem;
		margin: 0.1rem 0.25rem;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
		overflow: hidden;
	}

	.dm-item:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.dm-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-muted);
		flex-shrink: 0;
		overflow: hidden;
	}

	.dm-avatar img { width: 100%; height: 100%; object-fit: cover; }

	.dm-info { flex: 1; overflow: hidden; }

	.dm-name {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dm-last {
		font-size: 0.7rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dm-time { font-size: 0.65rem; color: var(--text-muted); flex-shrink: 0; }

	.home-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-base);
	}

	.friends-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 1rem;
		height: 48px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-base);
		flex-shrink: 0;
	}

	.friends-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
		border-right: 1px solid var(--border);
		padding-right: 1rem;
	}

	.tabs { display: flex; gap: 0.15rem; }

	.tab {
		padding: 0.25rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		transition: background var(--transition), color var(--transition);
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.tab:hover { background: var(--bg-elevated); color: var(--text-secondary); }
	.tab.active { background: var(--bg-elevated); color: var(--text-primary); font-weight: 600; }
	.tab-add.active { background: var(--accent); color: var(--accent-text); }

	.tab-badge {
		background: var(--error);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
		border-radius: 999px;
		min-width: 14px;
		text-align: center;
	}

	.friends-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
	}

	.section-label {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
		margin-top: 0.5rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 4rem 0;
		color: var(--text-muted);
		font-size: 0.82rem;
		text-align: center;
	}

	.empty-state :global(svg) { opacity: 0.35; }

	.friend-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.5rem;
		border-radius: var(--radius);
		border-bottom: 1px solid var(--border);
		transition: background var(--transition);
	}

	.friend-row:hover { background: var(--bg-surface); }

	.friend-avatar {
		position: relative;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-muted);
		flex-shrink: 0;
		overflow: hidden;
	}

	.friend-avatar img { width: 100%; height: 100%; object-fit: cover; }

	.status-dot {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--bg-base);
		background: var(--text-muted);
	}

	.status-dot.online { background: #3ba55d; }

	.friend-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.friend-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
	.friend-status { font-size: 0.72rem; color: var(--text-muted); }

	.friend-actions { display: flex; gap: 0.35rem; }

	.icon-action {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: none;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background var(--transition), color var(--transition);
	}

	.icon-action:hover { background: var(--bg-surface); color: var(--text-primary); }
	.icon-action.danger:hover { background: var(--error-surface); color: var(--error); }
	.icon-action.success:hover { background: rgba(59,165,93,0.15); color: #3ba55d; }

	.add-friend-panel {
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.add-friend-panel h3 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
	.add-friend-panel p { font-size: 0.82rem; color: var(--text-muted); }

	.add-form {
		display: flex;
		gap: 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.5rem;
	}

	.add-form input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text-primary);
		font-size: 0.85rem;
		font-family: inherit;
		padding: 0 0.25rem;
	}

	.btn-primary {
		padding: 0.35rem 0.85rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		font-family: inherit;
		transition: opacity var(--transition);
		white-space: nowrap;
	}

	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn-primary:hover:not(:disabled) { opacity: 0.85; }

	.error { font-size: 0.78rem; color: var(--error); }
	.success { font-size: 0.78rem; color: #3ba55d; }

	/* ── DM unread badge ── */
	.dm-unread-badge {
		background: var(--error);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
		flex-shrink: 0;
	}

	.dm-last-unread { color: var(--text-secondary); font-weight: 600; }

	/* ── New DM modal ── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 400;
	}

	.new-dm-modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		width: 360px;
		max-width: calc(100vw - 2rem);
		max-height: 480px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.new-dm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1rem 0.75rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.new-dm-header h4 { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); }

	.close-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.2rem 0.3rem;
		border-radius: var(--radius-sm);
		transition: color var(--transition), background var(--transition);
	}

	.close-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.empty-modal { font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 1rem; }

	.friend-pick-list {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.friend-pick-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem;
		border-radius: var(--radius);
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-secondary);
		width: 100%;
		text-align: left;
		transition: background var(--transition), color var(--transition);
	}

	.friend-pick-row:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.friend-pick-row:disabled { opacity: 0.5; cursor: not-allowed; }

	.pick-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-muted);
		overflow: hidden;
		flex-shrink: 0;
	}

	.pick-avatar img { width: 100%; height: 100%; object-fit: cover; }

	.pick-name { flex: 1; font-size: 0.85rem; font-weight: 600; }

	.pick-status {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-muted);
		flex-shrink: 0;
	}

	.pick-status.online { background: #3ba55d; }

	.icon-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0.1rem 0.2rem;
		border-radius: var(--radius-sm);
		transition: color var(--transition), background var(--transition);
	}

	.icon-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

	/* ── Friend search results ───────────────────────────────────────────── */
	.search-empty { font-size: 0.78rem; color: var(--text-muted); padding: 0.5rem 0; }
	.search-results { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-direction: column; gap: 0.35rem; }
	.search-result-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; background: var(--bg-elevated); border-radius: var(--radius); }
	.sr-avatar { flex-shrink: 0; }
	.sr-info { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; }
	.sr-name { font-size: 0.82rem; color: var(--text-primary); font-weight: 600; }
	.sr-tag { font-size: 0.68rem; color: var(--text-muted); }
	.btn-sm { font-size: 0.72rem; padding: 0.25rem 0.6rem; }
	.avatar-sm { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.avatar-init { display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); border: 1px solid var(--border); font-weight: 700; font-size: 0.7rem; color: var(--accent); border-radius: 50%; }
</style>

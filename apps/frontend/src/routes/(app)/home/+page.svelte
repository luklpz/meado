<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import type { ChatSocket } from '$lib/socket.js';

	let { data } = $props();
	const { user } = data;

	type Friend = { id: string; user: { id: string; username: string; avatarUrl?: string | null; online: boolean } };
	type Pending = { id: string; direction: 'incoming' | 'outgoing'; user: { id: string; username: string; avatarUrl?: string | null }; createdAt: string };
	type Conversation = { id: string; name: string | null; members: { id: string; username: string; avatarUrl?: string | null }[]; lastMessage: { content: string | null; createdAt: string; author: { username: string } } | null };

	let friends = $state<Friend[]>([...data.friends]);
	let pending = $state<Pending[]>([...data.pending]);
	let conversations = $state<Conversation[]>([...data.conversations]);

	let activeTab = $state<'online' | 'all' | 'pending' | 'add'>('online');
	let addUsername = $state('');
	let addError = $state('');
	let addSuccess = $state('');
	let addLoading = $state(false);
	let dmLoading = $state(false);

	let sock: ChatSocket | null = null;

	function handlePresence(data: { userId: string; online: boolean }) {
		friends = friends.map(f =>
			f.user.id === data.userId ? { ...f, user: { ...f.user, online: data.online } } : f
		);
	}

	onMount(() => {
		const token = authStore.getSocketToken();
		if (token) {
			sock = socketStore.connect(token);
			sock.on('presence:update', handlePresence);
		}
	});

	onDestroy(() => {
		sock?.off('presence:update', handlePresence);
	});

	const onlineFriends = $derived(friends.filter(f => f.user.online));
	const incomingPending = $derived(pending.filter(p => p.direction === 'incoming'));

	async function sendFriendRequest() {
		if (!addUsername.trim()) return;
		addError = '';
		addSuccess = '';
		addLoading = true;
		try {
			const res = await fetch('/api/friends/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username: addUsername.trim() }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				addError = err.message ?? 'Error al enviar solicitud.';
				return;
			}
			const p = await res.json();
			addSuccess = `Solicitud enviada a ${addUsername.trim()}.`;
			addUsername = '';
			pending = [...pending, { id: p.id, direction: 'outgoing', user: p.receiver, createdAt: p.createdAt }];
		} catch {
			addError = 'Error de red.';
		} finally {
			addLoading = false;
		}
	}

	async function acceptFriend(friendshipId: string) {
		const res = await fetch(`/api/friends/accept/${friendshipId}`, { method: 'POST', credentials: 'include' });
		if (!res.ok) return;
		const f = await res.json();
		pending = pending.filter(p => p.id !== friendshipId);
		friends = [...friends, { id: f.id, user: { ...f.sender, online: false } }];
	}

	async function removeFriend(friendshipId: string) {
		await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE', credentials: 'include' });
		friends = friends.filter(f => f.id !== friendshipId);
		pending = pending.filter(p => p.id !== friendshipId);
	}

	async function openOrCreateDm(userId: string) {
		if (dmLoading) return;
		dmLoading = true;
		try {
			const res = await fetch('/api/dm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ userIds: [userId] }),
			});
			if (!res.ok) return;
			const conv = await res.json();
			goto(`/home/dm/${conv.id}`);
		} finally {
			dmLoading = false;
		}
	}

	function convName(conv: Conversation) {
		if (conv.name) return conv.name;
		const others = conv.members.filter(m => m.id !== user.id);
		return others.map(m => m.username).join(', ') || 'Conversación';
	}

	function convAvatar(conv: Conversation) {
		const others = conv.members.filter(m => m.id !== user.id);
		return others[0]?.avatarUrl ?? null;
	}

	function convInitial(conv: Conversation) {
		const others = conv.members.filter(m => m.id !== user.id);
		return (others[0]?.username[0] ?? '?').toUpperCase();
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
			<input type="text" placeholder="Busca o inicia una conversación" disabled />
		</div>

		<button class="sidebar-nav-btn" onclick={() => (activeTab = 'online')}>
			<span class="nav-icon">👥</span>
			Amigos
			{#if incomingPending.length > 0}
				<span class="badge">{incomingPending.length}</span>
			{/if}
		</button>

		<div class="sidebar-section-header">
			<span>Mensajes directos</span>
		</div>

		{#each conversations as conv (conv.id)}
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
						<div class="dm-last">{conv.lastMessage.author.username}: {conv.lastMessage.content ?? '📎'}</div>
					{/if}
				</div>
				{#if conv.lastMessage}
					<span class="dm-time">{formatTime(conv.lastMessage.createdAt)}</span>
				{/if}
			</a>
		{/each}
	</aside>

	<!-- Main content -->
	<main class="home-main">
		<div class="friends-header">
			<span class="friends-title">👥 Amigos</span>
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
			{#if activeTab === 'online'}
				<div class="section-label">EN LÍNEA — {onlineFriends.length}</div>
				{#if onlineFriends.length === 0}
					<div class="empty-state"><p>Nadie online.</p></div>
				{:else}
					{#each onlineFriends as f (f.id)}
						<div class="friend-row">
							<div class="friend-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt={f.user.username} />
								{:else}
									<span>{f.user.username[0].toUpperCase()}</span>
								{/if}
								<div class="status-dot online"></div>
							</div>
							<div class="friend-info">
								<span class="friend-name">{f.user.username}</span>
								<span class="friend-status">En línea</span>
							</div>
							<div class="friend-actions">
								<button class="icon-action" title="Mensaje" onclick={() => openOrCreateDm(f.user.id)}>💬</button>
								<button class="icon-action danger" title="Eliminar" onclick={() => removeFriend(f.id)}>✕</button>
							</div>
						</div>
					{/each}
				{/if}

			{:else if activeTab === 'all'}
				<div class="section-label">TODOS LOS AMIGOS — {friends.length}</div>
				{#if friends.length === 0}
					<div class="empty-state"><p>Sin amigos todavía. Añade uno arriba.</p></div>
				{:else}
					{#each friends as f (f.id)}
						<div class="friend-row">
							<div class="friend-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt={f.user.username} />
								{:else}
									<span>{f.user.username[0].toUpperCase()}</span>
								{/if}
								<div class="status-dot" class:online={f.user.online}></div>
							</div>
							<div class="friend-info">
								<span class="friend-name">{f.user.username}</span>
								<span class="friend-status">{f.user.online ? 'En línea' : 'Desconectado'}</span>
							</div>
							<div class="friend-actions">
								<button class="icon-action" title="Mensaje" onclick={() => openOrCreateDm(f.user.id)}>💬</button>
								<button class="icon-action danger" title="Eliminar" onclick={() => removeFriend(f.id)}>✕</button>
							</div>
						</div>
					{/each}
				{/if}

			{:else if activeTab === 'pending'}
				{#if pending.length === 0}
					<div class="empty-state"><p>Sin solicitudes pendientes.</p></div>
				{:else}
					{#if incomingPending.length > 0}
						<div class="section-label">ENTRANTES — {incomingPending.length}</div>
						{#each incomingPending as p (p.id)}
							<div class="friend-row">
								<div class="friend-avatar">
									{#if p.user.avatarUrl}
										<img src={p.user.avatarUrl} alt={p.user.username} />
									{:else}
										<span>{p.user.username[0].toUpperCase()}</span>
									{/if}
								</div>
								<div class="friend-info">
									<span class="friend-name">{p.user.username}</span>
									<span class="friend-status">Solicitud entrante</span>
								</div>
								<div class="friend-actions">
									<button class="icon-action success" title="Aceptar" onclick={() => acceptFriend(p.id)}>✓</button>
									<button class="icon-action danger" title="Rechazar" onclick={() => removeFriend(p.id)}>✕</button>
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
										<span>{p.user.username[0].toUpperCase()}</span>
									{/if}
								</div>
								<div class="friend-info">
									<span class="friend-name">{p.user.username}</span>
									<span class="friend-status">Solicitud enviada</span>
								</div>
								<div class="friend-actions">
									<button class="icon-action danger" title="Cancelar" onclick={() => removeFriend(p.id)}>✕</button>
								</div>
							</div>
						{/each}
					{/if}
				{/if}

			{:else if activeTab === 'add'}
				<div class="add-friend-panel">
					<h3>Añadir amigo</h3>
					<p>Busca por nombre de usuario exacto.</p>
					<div class="add-form">
						<input
							type="text"
							bind:value={addUsername}
							placeholder="Nombre de usuario"
							onkeydown={(e) => e.key === 'Enter' && sendFriendRequest()}
						/>
						<button class="btn-primary" onclick={sendFriendRequest} disabled={addLoading || !addUsername.trim()}>
							{addLoading ? '…' : 'Enviar solicitud'}
						</button>
					</div>
					{#if addError}<p class="error">{addError}</p>{/if}
					{#if addSuccess}<p class="success">{addSuccess}</p>{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

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
		color: var(--text-muted);
		font-size: 0.78rem;
		font-family: inherit;
		cursor: not-allowed;
		box-sizing: border-box;
	}

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
		align-items: center;
		justify-content: center;
		padding: 3rem 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

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
</style>

<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import type { ChatSocket } from '$lib/socket.js';
	import { clearUnread } from '$lib/dmStore.js';

	let { data } = $props();
	const { user } = data;

	type DmMessage = {
		id: string;
		content: string | null;
		conversationId: string;
		createdAt: string;
		editedAt?: string | null;
		author: { id: string; username: string; avatarUrl?: string | null };
		attachments: { id: string; url: string; name: string; size: number; mimeType: string }[];
		reactions: { emoji: string; count: number; me: boolean }[];
	};

	type Conversation = {
		id: string;
		name: string | null;
		members: { id: string; username: string; avatarUrl?: string | null }[];
		lastMessage: any;
	};

	let conversation = $state(data.conversation as Conversation);
	let conversations = $state(data.conversations as Conversation[]);
	let messages = $state<DmMessage[]>([...data.messages]);
	let msgInput = $state('');
	let sending = $state(false);
	let messagesEl = $state<HTMLDivElement | null>(null);
	let typingUsernames = $state<string[]>([]);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	let hoveredId = $state<string | null>(null);

	// Add member modal
	let showAddMember = $state(false);
	let addMemberFriends = $state<{ id: string; user: { id: string; username: string; avatarUrl?: string | null } }[]>([]);
	let addMemberLoading = $state(false);
	let addMemberError = $state('');

	let sock: ChatSocket | null = null;

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

	function scrollToBottom(force = false) {
		if (!messagesEl) return;
		const near = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 200;
		if (force || near) {
			tick().then(() => {
				if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
			});
		}
	}

	function handleNewMessage(msg: DmMessage) {
		if (msg.conversationId !== conversation.id) return;
		messages = [...messages, msg];
		scrollToBottom();
	}

	function handleTypingUpdate(d: { conversationId: string; usernames: string[] }) {
		if (d.conversationId !== conversation.id) return;
		typingUsernames = d.usernames.filter(u => u !== user.username);
	}

	onMount(() => {
		clearUnread(conversation.id);
		const token = authStore.getSocketToken();
		if (token) {
			sock = socketStore.connect(token);
			sock.emit('dm:join', { conversationId: conversation.id });
			sock.on('dm:message:created', handleNewMessage);
			sock.on('dm:typing:update', handleTypingUpdate);
		}
		scrollToBottom(true);
	});

	onDestroy(() => {
		sock?.emit('dm:leave', { conversationId: conversation.id });
		sock?.off('dm:message:created', handleNewMessage);
		sock?.off('dm:typing:update', handleTypingUpdate);
	});

	async function sendMessage() {
		const content = msgInput.trim();
		if (!content || sending || !sock) return;
		msgInput = '';
		sending = true;
		stopTyping();
		try {
			sock.emit('dm:send', { conversationId: conversation.id, content });
		} finally {
			sending = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function startTyping() {
		if (!sock) return;
		sock.emit('dm:typing:start', { conversationId: conversation.id });
		if (typingTimeout) clearTimeout(typingTimeout);
		typingTimeout = setTimeout(stopTyping, 3000);
	}

	function stopTyping() {
		if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
		sock?.emit('dm:typing:stop', { conversationId: conversation.id });
	}

	async function openAddMember() {
		showAddMember = true;
		addMemberLoading = true;
		try {
			const res = await fetch('/api/friends', { credentials: 'include' });
			if (res.ok) {
				const all = await res.json();
				const memberIds = new Set(conversation.members.map(m => m.id));
				addMemberFriends = all.filter((f: any) => !memberIds.has(f.user.id));
			}
		} finally {
			addMemberLoading = false;
		}
	}

	async function addMember(friendUserId: string) {
		addMemberError = '';
		const res = await fetch(`/api/dm/${conversation.id}/members`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ userId: friendUserId }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			addMemberError = err.message ?? 'Error al añadir.';
			return;
		}
		const newMember = await res.json();
		conversation = { ...conversation, members: [...conversation.members, newMember] };
		addMemberFriends = addMemberFriends.filter(f => f.user.id !== friendUserId);
		if (addMemberFriends.length === 0) showAddMember = false;
	}

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDate(iso: string) {
		const d = new Date(iso);
		const today = new Date();
		if (d.toDateString() === today.toDateString()) return 'Hoy';
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
		return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
	}

	function avatarInitial(username: string) {
		return username[0]?.toUpperCase() ?? '?';
	}
</script>

<svelte:head><title>Meado — {convName(conversation)}</title></svelte:head>

<div class="dm-layout">
	<!-- Sidebar -->
	<aside class="home-sidebar">
		<div class="search-bar">
			<input type="text" placeholder="Busca o inicia una conversación" disabled />
		</div>

		<a href="/home" class="sidebar-nav-btn">
			<span class="nav-icon">👥</span>
			Amigos
		</a>

		<div class="sidebar-section-header">
			<span>Mensajes directos</span>
		</div>

		{#each conversations as conv (conv.id)}
			{@const isActive = conv.id === conversation.id}
			<a href="/home/dm/{conv.id}" class="dm-item" class:dm-item-active={isActive}>
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
			</a>
		{/each}
	</aside>

	<!-- Chat -->
	<div class="chat-area">
		<div class="chat-header">
			<div class="chat-header-avatar">
				{#if convAvatar(conversation)}
					<img src={convAvatar(conversation)} alt="" />
				{:else}
					<span>{convInitial(conversation)}</span>
				{/if}
			</div>
			<span class="chat-header-name">{convName(conversation)}</span>
			{#if conversation.members.length > 2}
				<span class="member-count">{conversation.members.length} miembros</span>
			{/if}
			<div class="header-actions">
				<button class="icon-btn" title="Añadir al grupo" onclick={openAddMember}>👥+</button>
			</div>
		</div>

		<div class="messages-area" bind:this={messagesEl}>
			{#if messages.length === 0}
				<div class="chat-welcome">
					<div class="welcome-avatar">
						{#if convAvatar(conversation)}
							<img src={convAvatar(conversation)} alt="" />
						{:else}
							<span>{convInitial(conversation)}</span>
						{/if}
					</div>
					<h3>Inicio de la conversación con {convName(conversation)}</h3>
				</div>
			{:else}
				{#each messages as msg, i (msg.id)}
					{@const prevMsg = messages[i - 1]}
					{@const sameAuthor = prevMsg?.author.id === msg.author.id && (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) < 5 * 60 * 1000}

					{#if !prevMsg || formatDate(prevMsg.createdAt) !== formatDate(msg.createdAt)}
						<div class="date-divider"><span>{formatDate(msg.createdAt)}</span></div>
					{/if}

					<div
						class="message"
						class:compact={sameAuthor}
						role="listitem"
						onmouseenter={() => (hoveredId = msg.id)}
						onmouseleave={() => (hoveredId = null)}
					>
						{#if !sameAuthor}
							<div class="avatar-col">
								{#if msg.author.avatarUrl}
									<img src={msg.author.avatarUrl} class="avatar-msg" alt="" />
								{:else}
									<div class="avatar-msg avatar-init">{avatarInitial(msg.author.username)}</div>
								{/if}
							</div>
							<div class="msg-body">
								<div class="msg-header">
									<span class="msg-author">{msg.author.username}</span>
									<span class="msg-time">{formatTime(msg.createdAt)}</span>
									{#if msg.editedAt}<span class="msg-edited">(editado)</span>{/if}
								</div>
								{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
							</div>
						{:else}
							<div class="avatar-col compact-spacer">
								{#if hoveredId === msg.id}
									<span class="compact-time">{formatTime(msg.createdAt)}</span>
								{/if}
							</div>
							<div class="msg-body">
								{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
							</div>
						{/if}
					</div>
				{/each}
			{/if}

			{#if typingUsernames.length > 0}
				<div class="typing-indicator">
					<div class="typing-dots"><span></span><span></span><span></span></div>
					<span>{typingUsernames.join(', ')} {typingUsernames.length === 1 ? 'está' : 'están'} escribiendo…</span>
				</div>
			{/if}
		</div>

		<div class="input-area">
			<div class="input-box">
				<textarea
					placeholder="Escribe un mensaje a {convName(conversation)}…"
					bind:value={msgInput}
					onkeydown={onKeydown}
					oninput={startTyping}
					rows="1"
				></textarea>
			</div>
		</div>
	</div>
</div>

{#if showAddMember}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<h4>Añadir al grupo</h4>
			{#if addMemberLoading}
				<p class="loading-text">Cargando amigos…</p>
			{:else if addMemberFriends.length === 0}
				<p class="muted">No hay amigos disponibles para añadir.</p>
			{:else}
				<div class="friend-pick-list">
					{#each addMemberFriends as f (f.id)}
						<button class="friend-pick-row" onclick={() => addMember(f.user.id)}>
							<div class="pick-avatar">
								{#if f.user.avatarUrl}
									<img src={f.user.avatarUrl} alt="" />
								{:else}
									<span>{f.user.username[0].toUpperCase()}</span>
								{/if}
							</div>
							<span class="pick-name">{f.user.username}</span>
							<span class="pick-add">+ Añadir</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if addMemberError}<p class="error">{addMemberError}</p>{/if}
			<div class="modal-actions">
				<button class="btn-ghost" onclick={() => { showAddMember = false; addMemberError = ''; }}>Cerrar</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.dm-layout {
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
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: thin;
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
		text-decoration: none;
		transition: background var(--transition), color var(--transition);
	}

	.sidebar-nav-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.nav-icon { font-size: 1rem; }

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

	.dm-item:hover, .dm-item-active { background: var(--bg-elevated); color: var(--text-primary); }

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
	.dm-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dm-last { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Chat area */
	.chat-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-base);
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0 1rem;
		height: 48px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-base);
		flex-shrink: 0;
	}

	.chat-header-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-muted);
		overflow: hidden;
		flex-shrink: 0;
	}

	.chat-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.chat-header-name { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); }
	.member-count { font-size: 0.75rem; color: var(--text-muted); margin-left: 0.25rem; }
	.header-actions { margin-left: auto; display: flex; gap: 0.25rem; }

	.icon-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.25rem 0.4rem;
		border-radius: var(--radius-sm);
		transition: color var(--transition), background var(--transition);
	}

	.icon-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.messages-area {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0 0;
		scrollbar-width: thin;
		min-height: 0;
	}

	.message {
		display: flex;
		gap: 0;
		padding: 0.15rem 1rem;
		position: relative;
	}

	.message:hover { background: var(--bg-surface); }
	.message.compact { padding-top: 0.05rem; }

	.avatar-col { width: 40px; flex-shrink: 0; padding-top: 0.1rem; }

	.avatar-msg {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.avatar-init {
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.compact-spacer { display: flex; align-items: center; justify-content: flex-end; }
	.compact-time { font-size: 0.58rem; color: var(--text-muted); white-space: nowrap; line-height: 1; }

	.msg-body { flex: 1; min-width: 0; }
	.msg-header { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.1rem; }
	.msg-author { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }
	.msg-time { font-size: 0.65rem; color: var(--text-muted); }
	.msg-edited { font-size: 0.6rem; color: var(--text-muted); }

	.msg-content {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--text-secondary);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.date-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		font-size: 0.65rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.date-divider::before, .date-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.chat-welcome {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 2rem 1.5rem;
		margin-top: auto;
	}

	.welcome-avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: var(--bg-surface);
		border: 2px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-muted);
		overflow: hidden;
	}

	.welcome-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.chat-welcome h3 { font-size: 1.2rem; color: var(--text-primary); }

	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 1rem 0.5rem;
		font-size: 0.72rem;
		color: var(--text-muted);
		min-height: 1.5rem;
	}

	.typing-dots { display: flex; gap: 3px; align-items: center; }
	.typing-dots span { width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); animation: bounce 1.2s infinite; }
	.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
	.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes bounce {
		0%, 60%, 100% { transform: translateY(0); }
		30% { transform: translateY(-4px); }
	}

	.input-area { padding: 0 1rem 1rem; flex-shrink: 0; }

	.input-box {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: flex-end;
		padding: 0.5rem 0.75rem;
	}

	.input-box textarea {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		font-family: inherit;
		font-size: 0.88rem;
		color: var(--text-primary);
		line-height: 1.45;
		max-height: 200px;
		overflow-y: auto;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
	}

	.modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		min-width: 280px;
		max-width: 360px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 480px;
		overflow: hidden;
	}

	h4 { font-size: 0.9rem; color: var(--text-primary); }
	.loading-text, .muted { font-size: 0.82rem; color: var(--text-muted); }

	.friend-pick-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		overflow-y: auto;
		flex: 1;
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

	.friend-pick-row:hover { background: var(--bg-elevated); color: var(--text-primary); }

	.pick-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-muted);
		overflow: hidden;
		flex-shrink: 0;
	}

	.pick-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.pick-name { flex: 1; font-size: 0.85rem; font-weight: 600; }
	.pick-add { font-size: 0.75rem; color: var(--accent); }

	.modal-actions { display: flex; justify-content: flex-end; }

	.btn-ghost {
		font-size: 0.8rem;
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
	}

	.error { font-size: 0.75rem; color: var(--error); }
</style>

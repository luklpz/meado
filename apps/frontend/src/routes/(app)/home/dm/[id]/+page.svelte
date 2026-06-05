<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import type { ChatSocket } from '$lib/socket.js';
	import { clearUnread } from '$lib/dmStore.js';
	import { conversationsStore } from '$lib/conversationsStore.js';
	import { playPing } from '$lib/ping.js';
	import { Users, UserPlus, Pencil, Trash2, Download, Send, Paperclip, Film, Music, FileText, FileSpreadsheet, Archive, File as FileIcon, Search, Menu } from 'lucide-svelte';
	import { uploadFile, goesToCloudinary } from '$lib/upload.js';
	import ServerProfileCard from '$lib/components/ServerProfileCard.svelte';

	let { data } = $props();
	const user = $derived(data.user as { id: string; username: string; role: string; avatarUrl?: string | null });

	type DmMessage = {
		id: string;
		content: string | null;
		conversationId: string;
		createdAt: string;
		editedAt?: string | null;
		author: { id: string; username: string; name?: string | null; avatarUrl?: string | null };
		attachments: { id: string; url: string; name: string; size: number; mimeType: string }[];
		reactions: { emoji: string; count: number; me: boolean }[];
	};

	type Conversation = {
		id: string;
		name: string | null;
		members: { id: string; username: string; name?: string | null; avatarUrl?: string | null }[];
		lastMessage: any;
	};

	// svelte-ignore state_referenced_locally
	let conversation = $state(data.conversation as Conversation);
	// svelte-ignore state_referenced_locally
	let messages = $state<DmMessage[]>([...data.messages]);

	let msgInput = $state('');
	let sending = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let messagesEl = $state<HTMLDivElement | null>(null);
	let typingUsernames = $state<string[]>([]);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(data.messages.length === 50);
	let loadingMore = $state(false);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	let hoveredId = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editingContent = $state('');

	let sidebarOpen = $state(false);
	let profileCardUserId = $state<string | null>(null);

	function openProfileCard(uid: string) {
		if (uid === user.id) return;
		profileCardUserId = uid;
	}

	const isDm1on1 = $derived(conversation.members.length === 2);
	const dmOtherUser = $derived(conversation.members.find(m => m.id !== user.id) ?? null);
	let sidebarSearch = $state('');
	const filteredConvs = $derived(
		sidebarSearch.trim()
			? $conversationsStore.filter(c => {
					const name = c.name ?? c.members.filter(m => m.id !== user.id).map(m => m.name || m.username).join(' ');
					return name.toLowerCase().includes(sidebarSearch.toLowerCase());
				})
			: $conversationsStore
	);

	// Add member modal
	let showAddMember = $state(false);
	let addMemberFriends = $state<{ id: string; user: { id: string; username: string; name?: string | null; avatarUrl?: string | null } }[]>([]);
	let addMemberLoading = $state(false);
	let addMemberError = $state('');

	let sock: ChatSocket | null = null;
	let currentConvId = data.conversation.id;

	$effect(() => {
		conversationsStore.seed(data.conversations);
	});

	$effect(() => {
		const newConvId = (data.conversation as Conversation).id;
		if (newConvId === currentConvId) return;
		currentConvId = newConvId;

		conversation = data.conversation as Conversation;
		messages = [...(data.messages as DmMessage[])];
		hasMore = (data.messages as DmMessage[]).length === 50;
		msgInput = '';
		typingUsernames = [];
		editingId = null;
		hoveredId = null;
		profileCardUserId = null;

		clearUnread(newConvId);
		if (sock) sock.emit('dm:join', { conversationId: newConvId });
		tick().then(() => scrollToBottom(true));
	});

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

	function scrollToBottom(force = false) {
		if (!messagesEl) return;
		const near = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 200;
		if (force || near) {
			tick().then(() => {
				if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
			});
		}
	}

	async function loadMoreMessages() {
		if (loadingMore || !hasMore || messages.length === 0) return;
		loadingMore = true;
		const oldest = messages[0].createdAt;
		try {
			const res = await fetch(`/api/dm/${conversation.id}/messages?limit=50&before=${encodeURIComponent(oldest)}`, { credentials: 'include' });
			if (res.ok) {
				const older: DmMessage[] = await res.json();
				if (older.length === 0) { hasMore = false; return; }
				const el = messagesEl;
				const prevHeight = el?.scrollHeight ?? 0;
				messages = [...older, ...messages];
				hasMore = older.length === 50;
				await tick();
				if (el) el.scrollTop = el.scrollHeight - prevHeight;
			}
		} finally {
			loadingMore = false;
		}
	}

	function onMessagesScroll() {
		if (!messagesEl || loadingMore || !hasMore) return;
		if (messagesEl.scrollTop < 120) loadMoreMessages();
	}

	function handleNewMessage(msg: DmMessage) {
		if (msg.conversationId !== conversation.id) return;
		messages = [...messages, msg];
		if (msg.author.id !== user.id && document.hidden) playPing();
		scrollToBottom();
	}

	function handleTypingUpdate(d: { conversationId: string; usernames: string[] }) {
		if (d.conversationId !== conversation.id) return;
		typingUsernames = d.usernames.filter(u => u !== user.username);
	}

	function handleDmUpdated(msg: DmMessage) {
		if (msg.conversationId !== conversation.id) return;
		messages = messages.map(m => m.id === msg.id ? msg : m);
	}

	function handleDmDeleted(d: { messageId: string; conversationId: string }) {
		if (d.conversationId !== conversation.id) return;
		messages = messages.filter(m => m.id !== d.messageId);
	}

	function handleDmReactionUpdated(d: { messageId: string; conversationId: string; reactions: { emoji: string; count: number; me: boolean }[] }) {
		if (d.conversationId !== conversation.id) return;
		messages = messages.map(m => m.id === d.messageId ? { ...m, reactions: d.reactions } : m);
	}

	function handleMemberAdded(d: { conversationId: string; member: { id: string; username: string; name?: string | null; avatarUrl?: string | null } }) {
		conversationsStore.addMember(d.conversationId, d.member);
		if (d.conversationId !== conversation.id) return;
		if (!conversation.members.some(m => m.id === d.member.id)) {
			conversation = { ...conversation, members: [...conversation.members, d.member] };
		}
	}

	function toggleDmReaction(msg: DmMessage, emoji: string) {
		if (!sock) return;
		sock.emit('dm:reaction:toggle', { messageId: msg.id, emoji });
	}

	function handleReconnect() {
		sock?.emit('dm:join', { conversationId: conversation.id });
	}

	onMount(async () => {
		clearUnread(conversation.id);
		let token = authStore.getSocketToken();
		if (!token) {
			await authStore.init();
			token = authStore.getSocketToken();
		}
		if (token) {
			sock = socketStore.connect(token);
			sock.emit('dm:join', { conversationId: conversation.id });
			sock.on('connect', handleReconnect);
			sock.on('dm:message:created', handleNewMessage);
			sock.on('dm:typing:update', handleTypingUpdate);
			sock.on('dm:message:updated', handleDmUpdated);
			sock.on('dm:message:deleted', handleDmDeleted);
			sock.on('dm:reaction:updated', handleDmReactionUpdated);
			sock.on('dm:member:added', handleMemberAdded);
		}
		scrollToBottom(true);
	});

	onDestroy(() => {
		if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
		sock?.off('connect', handleReconnect);
		sock?.off('dm:message:created', handleNewMessage);
		sock?.off('dm:typing:update', handleTypingUpdate);
		sock?.off('dm:message:updated', handleDmUpdated);
		sock?.off('dm:message:deleted', handleDmDeleted);
		sock?.off('dm:reaction:updated', handleDmReactionUpdated);
		sock?.off('dm:member:added', handleMemberAdded);
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

	async function sendFile(file: File) {
		const content = msgInput.trim();
		msgInput = '';
		const convId = conversation.id;
		let url: string, name: string, size: number, mimeType: string;
		try {
			if (goesToCloudinary(file)) {
				const r = await uploadFile(file);
				({ url, name, size, mimeType } = r);
			} else {
				throw new Error('El archivo supera el límite de 25 MB.');
			}
		} catch { return; } // upload tray already shows the error

		await fetch(`/api/dm/${convId}/messages`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: content || undefined, attachmentUrl: url, attachmentName: name, attachmentSize: size, attachmentMimeType: mimeType }),
		}).catch(() => {});
	}

	function onFileChange(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) { sendFile(f); (e.target as HTMLInputElement).value = ''; }
	}

	function onPaste(e: ClipboardEvent) {
		const file = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file')?.getAsFile();
		if (file) { e.preventDefault(); sendFile(file); }
	}

	function fileSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function fileIcon(mime: string): any {
		if (mime.startsWith('video/')) return Film;
		if (mime.startsWith('audio/')) return Music;
		if (mime === 'application/pdf') return FileText;
		if (mime.includes('word') || mime.includes('document')) return FileText;
		if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) return FileSpreadsheet;
		if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('gzip') || mime.includes('7z')) return Archive;
		if (mime.startsWith('text/')) return FileText;
		return FileIcon;
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

	function startEdit(msg: DmMessage) {
		editingId = msg.id;
		editingContent = msg.content ?? '';
	}

	function cancelEdit() { editingId = null; editingContent = ''; }

	async function submitEdit(msg: DmMessage) {
		const content = editingContent.trim();
		if (!content) return;
		const res = await fetch(`/api/dm/${conversation.id}/messages/${msg.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ content }),
		});
		if (res.ok) cancelEdit();
	}

	async function deleteMsg(msg: DmMessage) {
		await fetch(`/api/dm/${conversation.id}/messages/${msg.id}`, {
			method: 'DELETE', credentials: 'include',
		});
	}

	function onEditKeydown(e: KeyboardEvent, msg: DmMessage) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(msg); }
		if (e.key === 'Escape') cancelEdit();
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

<div class="dm-layout" class:sidebar-open={sidebarOpen}>
	<!-- Sidebar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="sidebar-overlay" onclick={() => (sidebarOpen = false)} onkeydown={() => {}}></div>
	<aside class="home-sidebar">
		<div class="search-bar">
			<div class="home-search">
				<Search size={13} />
				<input type="text" placeholder="Buscar" bind:value={sidebarSearch} />
			</div>
		</div>

		<a href="/home" class="sidebar-nav-btn">
			<span class="nav-icon"><Users size={16} /></span>
			Amigos
		</a>

		<div class="sidebar-section-header">
			<span>Mensajes directos</span>
		</div>

		<div class="dm-list">
			{#each filteredConvs as conv (conv.id)}
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
							<div class="dm-last">{conv.lastMessage.author.name || conv.lastMessage.author.username}: {conv.lastMessage.content ?? 'Archivo adjunto'}</div>
						{/if}
					</div>
				</a>
			{/each}
		</div>

	</aside>

	<!-- Chat -->
	<div class="chat-area">
		<div class="chat-header">
			<button class="hamburger-btn" onclick={() => (sidebarOpen = !sidebarOpen)} title="Menú"><Menu size={18} /></button>
			<button
				class="chat-header-avatar"
				class:clickable={isDm1on1}
				onclick={() => isDm1on1 && dmOtherUser && openProfileCard(dmOtherUser.id)}
				disabled={!isDm1on1}
				title={isDm1on1 ? 'Ver perfil' : undefined}
			>
				{#if convAvatar(conversation)}
					<img src={convAvatar(conversation)} alt="" />
				{:else}
					<span>{convInitial(conversation)}</span>
				{/if}
			</button>
			<button
				class="chat-header-name-btn"
				class:clickable={isDm1on1}
				onclick={() => isDm1on1 && dmOtherUser && openProfileCard(dmOtherUser.id)}
				disabled={!isDm1on1}
			>{convName(conversation)}</button>
			{#if conversation.members.length > 2}
				<span class="member-count">{conversation.members.length} miembros</span>
			{/if}
			<div class="header-actions">
				<button class="icon-btn" title="Añadir al grupo" onclick={openAddMember}><UserPlus size={16} /></button>
			</div>
		</div>

		<div class="messages-area" bind:this={messagesEl} onscroll={onMessagesScroll}>
			{#if loadingMore}
				<div class="loading-more">Cargando mensajes anteriores…</div>
			{/if}
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
								<button class="avatar-btn-msg" onclick={() => openProfileCard(msg.author.id)}>
									{#if msg.author.avatarUrl}
										<img src={msg.author.avatarUrl} class="avatar-msg" alt="" />
									{:else}
										<div class="avatar-msg avatar-init">{avatarInitial(msg.author.name || msg.author.username)}</div>
									{/if}
								</button>
							</div>
							<div class="msg-body">
								<div class="msg-header">
									<button class="msg-author-btn" onclick={() => openProfileCard(msg.author.id)}>{msg.author.name || msg.author.username}</button>
									<span class="msg-time">{formatTime(msg.createdAt)}</span>
									{#if msg.editedAt}<span class="msg-edited">(editado)</span>{/if}
								</div>
								{#if editingId === msg.id}
									<div class="edit-box">
										<textarea bind:value={editingContent} onkeydown={(e) => onEditKeydown(e, msg)} rows="1" maxlength="4000" class="edit-input"></textarea>
										<div class="edit-actions">
											<button class="edit-save" onclick={() => submitEdit(msg)}>Guardar</button>
											<button class="edit-cancel" onclick={cancelEdit}>Esc · Cancelar</button>
										</div>
									</div>
								{:else}
									{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
									{#if msg.attachments?.length}
										<div class="attachments">
											{#each msg.attachments as att}
												{#if att.mimeType.startsWith('image/')}
													<a href={att.url} target="_blank" rel="noreferrer" class="att-img-wrap">
														<img src={att.url} alt={att.name} class="att-image" loading="lazy" />
													</a>
												{:else}
													{@const AttIcon = fileIcon(att.mimeType)}
													<div class="att-file">
														<span class="att-file-icon"><AttIcon size={18} /></span>
														<div class="att-info">
															<a href={att.url} target="_blank" rel="noreferrer" class="att-file-name">{att.name}</a>
															<span class="att-size">{fileSize(att.size)}</span>
														</div>
														<a href={att.url} target="_blank" rel="noreferrer" class="att-dl" aria-label="Descargar"><Download size={14} /></a>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
									{#if msg.reactions?.length}
										<div class="reactions">
											{#each msg.reactions as r (r.emoji)}
												<button class="reaction-pill" class:reacted={r.me} onclick={() => toggleDmReaction(msg, r.emoji)}>{r.emoji} {r.count}</button>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{:else}
							<div class="avatar-col compact-spacer">
								{#if hoveredId === msg.id}
									<span class="compact-time">{formatTime(msg.createdAt)}</span>
								{/if}
							</div>
							<div class="msg-body">
								{#if editingId === msg.id}
									<div class="edit-box">
										<textarea bind:value={editingContent} onkeydown={(e) => onEditKeydown(e, msg)} rows="1" maxlength="4000" class="edit-input"></textarea>
										<div class="edit-actions">
											<button class="edit-save" onclick={() => submitEdit(msg)}>Guardar</button>
											<button class="edit-cancel" onclick={cancelEdit}>Esc · Cancelar</button>
										</div>
									</div>
								{:else}
									{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
									{#if msg.attachments?.length}
										<div class="attachments">
											{#each msg.attachments as att}
												{#if att.mimeType.startsWith('image/')}
													<a href={att.url} target="_blank" rel="noreferrer" class="att-img-wrap">
														<img src={att.url} alt={att.name} class="att-image" loading="lazy" />
													</a>
												{:else}
													{@const AttIcon = fileIcon(att.mimeType)}
													<div class="att-file">
														<span class="att-file-icon"><AttIcon size={18} /></span>
														<div class="att-info">
															<a href={att.url} target="_blank" rel="noreferrer" class="att-file-name">{att.name}</a>
															<span class="att-size">{fileSize(att.size)}</span>
														</div>
														<a href={att.url} target="_blank" rel="noreferrer" class="att-dl" aria-label="Descargar"><Download size={14} /></a>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
									{#if msg.reactions?.length}
										<div class="reactions">
											{#each msg.reactions as r (r.emoji)}
												<button class="reaction-pill" class:reacted={r.me} onclick={() => toggleDmReaction(msg, r.emoji)}>{r.emoji} {r.count}</button>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{/if}
						{#if hoveredId === msg.id && editingId !== msg.id}
							<div class="msg-actions">
								<div class="emoji-picker">
									{#each ['👍','❤️','😂','😮','😢'] as emoji}
										<button class="emoji-pick-btn" onclick={() => toggleDmReaction(msg, emoji)}>{emoji}</button>
									{/each}
								</div>
								{#if msg.author.id === user.id}
									<button class="msg-action-btn" onclick={() => startEdit(msg)} title="Editar"><Pencil size={14} /></button>
									<button class="msg-action-btn danger" onclick={() => deleteMsg(msg)} title="Borrar"><Trash2 size={14} /></button>
								{/if}
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
				<button class="attach-btn" title="Adjuntar archivo" onclick={() => fileInput?.click()}><Paperclip size={16} /></button>
				<input class="hidden-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" bind:this={fileInput} onchange={onFileChange} />
				<textarea
					placeholder="Escribe un mensaje a {convName(conversation)}…"
					bind:value={msgInput}
					onkeydown={onKeydown}
					oninput={startTyping}
					onpaste={onPaste}
					rows="1"
					maxlength="4000"
				></textarea>
				<button class="send-btn" disabled={!msgInput.trim() || sending} onclick={sendMessage}><Send size={15} /></button>
			</div>
		</div>
	</div>
</div>

{#if profileCardUserId}
	<ServerProfileCard
		targetUserId={profileCardUserId}
		viewerId={user.id}
		onclose={() => (profileCardUserId = null)}
		onOpenDm={(uid) => { profileCardUserId = null; if (uid !== (dmOtherUser?.id ?? '')) goto(`/home`); }}
	/>
{/if}

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
									<span>{(f.user.name || f.user.username)[0].toUpperCase()}</span>
								{/if}
							</div>
							<span class="pick-name">{f.user.name || f.user.username}</span>
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
		width: 264px;
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
		overflow-x: hidden;
		scrollbar-width: thin;
		min-height: 0;
		padding-bottom: 60px;
	}

	.search-bar {
		padding: 0.75rem 0.75rem 0.5rem;
	}

	.home-search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--bg-elevated);
		border-radius: var(--radius-pill);
		padding: 0.3rem 0.75rem;
		color: var(--text-muted);
	}

	.home-search input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: inherit;
		min-width: 0;
	}

	.home-search input::placeholder { color: var(--text-muted); }

	.sidebar-nav-btn {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.7rem;
		background: transparent;
		border: none;
		border-radius: var(--radius);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		margin: 0.25rem 0.6rem 0.4rem;
		width: calc(100% - 1.2rem);
		text-decoration: none;
		transition: background var(--transition), color var(--transition);
	}

	.sidebar-nav-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.nav-icon { font-size: 1rem; }

	.sidebar-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
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

	.dm-item:hover, .dm-item-active { background: var(--bg-hover); color: var(--text-primary); }

	.dm-avatar {
		width: 38px;
		height: 38px;
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
	.dm-name { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dm-last { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
		height: 56px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-base);
		flex-shrink: 0;
	}

	.chat-header-avatar {
		width: 32px;
		height: 32px;
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

	.chat-header-avatar {
		cursor: default;
		padding: 0;
		border: none;
	}
	.chat-header-avatar.clickable { cursor: pointer; transition: opacity var(--transition); }
	.chat-header-avatar.clickable:hover { opacity: 0.8; }
	.chat-header-avatar img { width: 100%; height: 100%; object-fit: cover; }

	.chat-header-name-btn {
		font-size: 0.9rem; font-weight: 700; color: var(--text-primary);
		background: none; border: none; padding: 0; cursor: default; font-family: inherit;
	}
	.chat-header-name-btn.clickable { cursor: pointer; }
	.chat-header-name-btn.clickable:hover { text-decoration: underline; }
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
		gap: 0.8rem;
		padding: 0.35rem 0.5rem;
		padding-right: 5rem;
		border-radius: var(--radius);
		position: relative;
	}

	.message:hover { background: color-mix(in oklab, var(--bg-surface) 60%, transparent); }
	.message.compact { padding-top: 0.05rem; }

	.avatar-col { width: 42px; flex-shrink: 0; padding-top: 0.1rem; }

	.avatar-msg {
		width: 42px; height: 42px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.avatar-init {
		width: 42px; height: 42px;
		border-radius: 50%;
		background: var(--bg-elevated);
		display: grid;
		place-items: center;
		font-size: 1rem;
		font-weight: 800;
		color: var(--text-secondary);
	}

	.compact-spacer { display: flex; align-items: center; justify-content: flex-end; }
	.compact-time { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted); white-space: nowrap; line-height: 1; }

	.msg-body { flex: 1; min-width: 0; }
	.msg-header { display: flex; align-items: baseline; gap: 0.55rem; margin-bottom: 0.1rem; }
	.msg-author-btn { font-size: 0.9rem; font-weight: 800; color: var(--text-primary); background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
	.msg-author-btn:hover { text-decoration: underline; }
	.avatar-btn-msg { background: none; border: none; padding: 0; cursor: pointer; border-radius: 50%; display: block; }
	.avatar-btn-msg:hover .avatar-msg, .avatar-btn-msg:hover .avatar-init { opacity: 0.8; }
	.msg-time { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); }
	.msg-edited { font-size: 0.62rem; color: var(--text-muted); }

	.msg-content {
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--text-secondary);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		text-wrap: pretty;
	}

	.msg-actions {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		gap: 0.15rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.1rem 0.2rem;
	}

	.msg-action-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0.15rem 0.25rem;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		transition: background var(--transition), color var(--transition);
	}

	.msg-action-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.msg-action-btn.danger:hover { background: var(--error-surface); color: var(--error); }

	.edit-box { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.15rem; }

	.edit-input {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.45;
		padding: 0.35rem 0.5rem;
		resize: none;
		outline: none;
		box-sizing: border-box;
	}

	.edit-actions { display: flex; gap: 0.4rem; font-size: 0.72rem; }

	.edit-save {
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 600;
	}

	.edit-cancel {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.72rem;
	}

	.edit-cancel:hover { color: var(--text-primary); }

	.attachments { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.3rem; }

	.att-img-wrap { display: inline-block; }
	.att-image { max-width: 320px; max-height: 240px; border-radius: var(--radius); object-fit: contain; display: block; cursor: zoom-in; }

	.att-file {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		max-width: 300px;
	}

	.att-file-icon { flex-shrink: 0; color: var(--text-muted); display: flex; align-items: center; }

	.att-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		overflow: hidden;
	}

	.att-file-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.att-file-name:hover { text-decoration: underline; }
	.att-size { color: var(--text-muted); font-size: 0.68rem; }

	.att-dl {
		flex-shrink: 0;
		width: 24px; height: 24px;
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center;
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-decoration: none;
		transition: background var(--transition), color var(--transition);
	}

	.att-dl:hover { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }

	/* Attach + send buttons */
	.attach-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0 0.25rem;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		transition: color var(--transition);
	}

	.attach-btn:hover:not(:disabled) { color: var(--text-primary); }
	.attach-btn:disabled { opacity: 0.35; cursor: default; }

	.hidden-file { display: none; }

	.send-btn {
		background: var(--accent);
		border: none;
		color: var(--accent-text);
		width: 36px; height: 36px;
		border-radius: 50%;
		cursor: pointer;
		display: grid; place-items: center;
		flex-shrink: 0;
		transition: transform var(--transition) var(--ease-bounce), filter var(--transition);
	}

	.send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
	.send-btn:not(:disabled):hover { filter: brightness(1.06); transform: scale(1.08); }

	.att-file {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.65rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text-secondary);
		font-size: 0.8rem;
		max-width: 320px;
	}

	.att-size { font-size: 0.68rem; color: var(--text-muted); flex-shrink: 0; }

	.reactions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }

	.reaction-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		font-size: 0.76rem;
		color: var(--text-secondary);
		cursor: pointer;
		font-family: inherit;
		transition: border-color var(--transition), transform var(--transition);
	}
	.reaction-pill:hover { border-color: var(--accent); transform: translateY(-1px); }
	.reaction-pill.reacted {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.emoji-picker { display: flex; gap: 0.1rem; align-items: center; }
	.emoji-pick-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.15rem 0.2rem;
		border-radius: var(--radius-sm);
		transition: background var(--transition);
		line-height: 1;
	}
	.emoji-pick-btn:hover { background: var(--bg-surface); }

	.loading-more {
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 0.5rem 0;
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
		gap: 0.5rem;
		padding: 0.3rem 1.4rem;
		height: 26px;
		flex-shrink: 0;
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.typing-dots { display: inline-flex; gap: 3px; }
	.typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: typing 1.2s infinite ease-in-out; }
	.typing-dots span:nth-child(2) { animation-delay: 0.18s; }
	.typing-dots span:nth-child(3) { animation-delay: 0.36s; }

	@keyframes typing {
		0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
		30% { transform: translateY(-5px); opacity: 1; }
	}

	.input-area { padding: 0.4rem 1.1rem 1.1rem; flex-shrink: 0; }

	.input-box {
		background: var(--bg-elevated);
		border: 1.5px solid var(--border);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: flex-end;
		padding: 0.5rem 0.6rem;
		transition: border-color var(--transition), box-shadow var(--transition);
	}

	.input-box:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-dim);
	}

	.input-box textarea {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text-primary);
		line-height: 1.4;
		max-height: 120px;
		overflow-y: auto;
		padding: 0.45rem 0;
	}

	.input-box textarea::placeholder { color: var(--text-muted); }

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

	/* ── Hamburger ── */
	.hamburger-btn {
		display: none; background: transparent; border: none; cursor: pointer;
		color: var(--text-muted); padding: 0.2rem; border-radius: var(--radius-sm);
		align-items: center; justify-content: center; flex-shrink: 0;
		transition: color var(--transition), background var(--transition);
	}
	.hamburger-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

	.sidebar-overlay {
		display: none; position: fixed; inset: 0; z-index: 89;
		background: rgba(0,0,0,0.5);
	}

	/* ── Mobile ── */
	@media (max-width: 768px) {
		.dm-layout { position: relative; }

		.home-sidebar {
			position: fixed; top: 0; left: 72px; bottom: 0; z-index: 90;
			transform: translateX(calc(-100% - 72px));
			transition: transform 0.28s var(--ease-bounce);
			box-shadow: var(--shadow-pop);
		}

		.dm-layout.sidebar-open .home-sidebar { transform: none; }
		.dm-layout.sidebar-open .sidebar-overlay { display: block; }

		.hamburger-btn { display: flex; }

		.chat-area { padding-bottom: 60px; }
	}
</style>

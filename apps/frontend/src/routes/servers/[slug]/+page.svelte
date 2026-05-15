<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';
	import type { MessagePayload, VoiceMember } from '$lib/types/socket-events.types.js';

	let { data } = $props();
	const { user, server } = data;

	// ── Types ──────────────────────────────────────────────────────────────
	interface Channel { id: string; name: string; type: 'TEXT' | 'VOICE'; position: number; }

	// ── State ──────────────────────────────────────────────────────────────
	let selectedChannel = $state<Channel | null>(null);
	let messages = $state<MessagePayload[]>([]);
	let messagesLoading = $state(false);
	let voiceChannelId = $state<string | null>(null);
	let voiceMembers = $state<Map<string, VoiceMember[]>>(new Map());
	let msgInput = $state('');
	let sendingMsg = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let messagesEl = $state<HTMLDivElement | null>(null);

	// ── Derived ────────────────────────────────────────────────────────────
	let textChannels = $derived((server.channels as Channel[]).filter((c) => c.type === 'TEXT'));
	let voiceChannels = $derived((server.channels as Channel[]).filter((c) => c.type === 'VOICE'));
	let currentVoiceMembers = $derived(voiceChannelId ? (voiceMembers.get(voiceChannelId) ?? []) : []);
	const micEnabledStore = livekitStore.micEnabled;

	// ── Socket setup ───────────────────────────────────────────────────────
	onMount(() => {
		const token = authStore.getSocketToken();
		if (!token) { goto('/login'); return; }
		const socket = socketStore.connect(token);

		socket.on('message:created', (msg) => {
			if (msg.channelId !== selectedChannel?.id) return;
			messages = [...messages, msg];
			scrollToBottom();
		});

		socket.on('message:updated', (msg) => {
			if (msg.channelId !== selectedChannel?.id) return;
			messages = messages.map((m) => (m.id === msg.id ? msg : m));
		});

		socket.on('message:deleted', ({ messageId, channelId }) => {
			if (channelId !== selectedChannel?.id) return;
			messages = messages.filter((m) => m.id !== messageId);
		});

		socket.on('voice:state', ({ channelId, members }) => {
			voiceMembers = new Map(voiceMembers).set(channelId, members);
		});

		socket.on('voice:joined', ({ channelId, member }) => {
			const prev = voiceMembers.get(channelId) ?? [];
			if (prev.find((m) => m.userId === member.userId)) return;
			voiceMembers = new Map(voiceMembers).set(channelId, [...prev, member]);
		});

		socket.on('voice:left', ({ channelId, userId }) => {
			const prev = voiceMembers.get(channelId) ?? [];
			voiceMembers = new Map(voiceMembers).set(channelId, prev.filter((m) => m.userId !== userId));
		});

		// Select first text channel
		if (textChannels.length > 0) selectChannel(textChannels[0]);

		return () => {
			socket.off('message:created');
			socket.off('message:updated');
			socket.off('message:deleted');
			socket.off('voice:state');
			socket.off('voice:joined');
			socket.off('voice:left');
			if (selectedChannel) socket.emit('channel:leave', { channelId: selectedChannel.id });
			if (voiceChannelId) {
				socket.emit('voice:leave', { channelId: voiceChannelId });
				livekitStore.disconnect();
			}
		};
	});

	// ── Channel selection ─────────────────────────────────────────────────
	async function selectChannel(ch: Channel) {
		const socket = socketStore.raw();
		if (!socket) return;

		if (selectedChannel) socket.emit('channel:leave', { channelId: selectedChannel.id });
		selectedChannel = ch;
		socket.emit('channel:join', { channelId: ch.id });

		if (ch.type === 'TEXT') {
			await loadMessages(ch.id);
		}
	}

	// ── Messages ──────────────────────────────────────────────────────────
	async function loadMessages(channelId: string) {
		messagesLoading = true;
		messages = [];
		try {
			const res = await fetch(`/api/channels/${channelId}/messages`, { credentials: 'include' });
			if (res.ok) messages = await res.json();
		} finally {
			messagesLoading = false;
			scrollToBottom();
		}
	}

	async function sendMessage(e?: Event) {
		e?.preventDefault();
		const content = msgInput.trim();
		if (!content || !selectedChannel || sendingMsg) return;

		const socket = socketStore.raw();
		if (!socket) return;

		sendingMsg = true;
		msgInput = '';
		socket.emit('message:send', { channelId: selectedChannel.id, content });
		sendingMsg = false;
	}

	async function sendFile(file: File) {
		if (!selectedChannel) return;
		const fd = new FormData();
		fd.append('file', file);
		if (msgInput.trim()) fd.append('content', msgInput.trim());
		msgInput = '';
		await fetch(`/api/channels/${selectedChannel.id}/messages`, {
			method: 'POST',
			credentials: 'include',
			body: fd,
		});
	}

	function onFileChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files?.[0]) { sendFile(files[0]); (e.target as HTMLInputElement).value = ''; }
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// ── Voice ─────────────────────────────────────────────────────────────
	async function joinVoiceChannel(ch: Channel) {
		if (voiceChannelId) await leaveVoice();

		const res = await fetch(`/api/channels/${ch.id}/livekit-token`, { credentials: 'include' });
		if (!res.ok) return;
		const { token, url } = await res.json();

		const socket = socketStore.raw();
		socket?.emit('voice:join', { channelId: ch.id });

		voiceChannelId = ch.id;
		await livekitStore.connect(url, token);

		// Select the voice channel as the visible view
		selectedChannel = ch;
	}

	async function leaveVoice() {
		if (!voiceChannelId) return;
		const socket = socketStore.raw();
		socket?.emit('voice:leave', { channelId: voiceChannelId });
		livekitStore.disconnect();
		voiceChannelId = null;
		// Go back to first text channel
		if (textChannels.length > 0) selectChannel(textChannels[0]);
	}

	// ── Helpers ───────────────────────────────────────────────────────────
	function scrollToBottom() {
		setTimeout(() => { if (messagesEl) messagesEl!.scrollTop = messagesEl!.scrollHeight; }, 50);
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	function avatarInitial(username: string): string {
		return username[0].toUpperCase();
	}

	function fileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const isImage = (mime: string) => mime.startsWith('image/');

</script>

<svelte:head><title>{server.name} — Meado</title></svelte:head>

<div class="discord-layout">
	<!-- ── Sidebar ─────────────────────────────────────────────────────── -->
	<aside class="sidebar">
		<div class="server-header">
			<span class="server-name-text">{server.name}</span>
			<a href="/servers" class="back-btn" title="Volver a servidores">←</a>
		</div>

		<nav class="channel-nav">
			{#if textChannels.length > 0}
				<div class="channel-category">TEXTO</div>
				{#each textChannels as ch (ch.id)}
					<button
						class="channel-btn"
						class:active={selectedChannel?.id === ch.id && selectedChannel.type === 'TEXT'}
						onclick={() => selectChannel(ch)}
					>
						<span class="ch-prefix">#</span>
						<span class="ch-name">{ch.name}</span>
					</button>
				{/each}
			{/if}

			{#if voiceChannels.length > 0}
				<div class="channel-category">VOZ</div>
				{#each voiceChannels as ch (ch.id)}
					<button
						class="channel-btn voice-ch"
						class:active={voiceChannelId === ch.id}
						onclick={() => joinVoiceChannel(ch)}
					>
						<span class="ch-prefix">🔊</span>
						<span class="ch-name">{ch.name}</span>
						{#if voiceChannelId === ch.id}
							<span class="voice-dot"></span>
						{/if}
					</button>
					{#if (voiceMembers.get(ch.id) ?? []).length > 0}
						<div class="voice-participants-sidebar">
							{#each voiceMembers.get(ch.id) ?? [] as m (m.userId)}
								<div class="voice-participant-item">
									{#if m.avatarUrl}
										<img src={m.avatarUrl} class="avatar-xs" alt="" />
									{:else}
										<div class="avatar-xs avatar-init">{avatarInitial(m.username)}</div>
									{/if}
									<span class="vp-name">{m.username}</span>
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</nav>

		<!-- User area -->
		<div class="user-area">
			{#if voiceChannelId}
				<div class="voice-status">
					<span class="voice-status-label">🟢 En voz</span>
					<div class="voice-status-actions">
						<button
							class="ctrl-btn"
							class:active={$micEnabledStore}
							title={$micEnabledStore ? 'Silenciar' : 'Activar micro'}
							onclick={() => livekitStore.toggleMic()}
						>
							{$micEnabledStore ? '🎙️' : '🔇'}
						</button>
						<button class="ctrl-btn danger" title="Desconectar" onclick={leaveVoice}>📵</button>
					</div>
				</div>
			{/if}
			<div class="user-info">
				{#if user.avatarUrl}
					<img src={user.avatarUrl} class="avatar-sm" alt="" />
				{:else}
					<div class="avatar-sm avatar-init">{avatarInitial(user.username)}</div>
				{/if}
				<span class="username-text">{user.username}</span>
			</div>
		</div>
	</aside>

	<!-- ── Main content ────────────────────────────────────────────────── -->
	<main class="main-content">
		{#if !selectedChannel}
			<div class="empty-state">Selecciona un canal</div>

		{:else if selectedChannel.type === 'TEXT'}
			<!-- Channel header -->
			<div class="content-header">
				<span class="header-prefix">#</span>
				<strong class="header-name">{selectedChannel.name}</strong>
			</div>

			<!-- Messages -->
			<div class="messages-area" bind:this={messagesEl}>
				{#if messagesLoading}
					<div class="loading">Cargando mensajes…</div>
				{:else if messages.length === 0}
					<div class="welcome-message">
						<div class="welcome-icon">#</div>
						<h3>Bienvenido a #{selectedChannel.name}</h3>
						<p>Este es el inicio del canal.</p>
					</div>
				{:else}
					{#each messages as msg, i (msg.id)}
						{@const prevMsg = messages[i - 1]}
						{@const sameAuthor = prevMsg?.author.id === msg.author.id && (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) < 5 * 60 * 1000}
						{@const isOwn = msg.author.id === user.id}

						{#if !prevMsg || formatDate(prevMsg.createdAt) !== formatDate(msg.createdAt)}
							<div class="date-divider"><span>{formatDate(msg.createdAt)}</span></div>
						{/if}

						<div class="message" class:compact={sameAuthor} class:own={isOwn}>
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
									{#each msg.attachments as att (att.id)}
										<div class="attachment">
											{#if isImage(att.mimeType)}
												<img src={att.url} class="att-img" alt={att.name} />
											{:else}
												<a href={att.url} target="_blank" class="att-file">
													📎 {att.name} <span class="att-size">({fileSize(att.size)})</span>
												</a>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<div class="avatar-col compact-spacer"></div>
								<div class="msg-body">
									{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
									{#each msg.attachments as att (att.id)}
										<div class="attachment">
											{#if isImage(att.mimeType)}
												<img src={att.url} class="att-img" alt={att.name} />
											{:else}
												<a href={att.url} target="_blank" class="att-file">
													📎 {att.name} <span class="att-size">({fileSize(att.size)})</span>
												</a>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Message input -->
			<div class="input-area">
				<div class="input-box">
					<button class="attach-btn" title="Adjuntar archivo" onclick={() => fileInput?.click()}>+</button>
					<input
						class="hidden-file"
						type="file"
						accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
						bind:this={fileInput}
						onchange={onFileChange}
					/>
					<textarea
						class="msg-input"
						placeholder="Escribir en #{selectedChannel.name}"
						bind:value={msgInput}
						onkeydown={onKeydown}
						rows="1"
					></textarea>
					<button
						class="send-btn"
						disabled={!msgInput.trim() || sendingMsg}
						onclick={() => sendMessage()}
					>↑</button>
				</div>
			</div>

		{:else if selectedChannel.type === 'VOICE'}
			<!-- Voice channel view -->
			<div class="content-header">
				<span class="header-prefix">🔊</span>
				<strong class="header-name">{selectedChannel.name}</strong>
			</div>

			<div class="voice-view">
				{#if voiceChannelId !== selectedChannel.id}
					<div class="voice-join-prompt">
						<div class="voice-icon-big">🔊</div>
						<h3>{selectedChannel.name}</h3>
						<p>{(voiceMembers.get(selectedChannel.id) ?? []).length} participante(s)</p>
						<button class="btn-primary" onclick={() => selectedChannel && joinVoiceChannel(selectedChannel)}>
							Unirse al canal de voz
						</button>
					</div>
				{:else}
					<div class="voice-participants-grid">
						{#each currentVoiceMembers as m (m.userId)}
							<div class="voice-card" class:is-you={m.userId === user.id}>
								{#if m.avatarUrl}
									<img src={m.avatarUrl} class="voice-avatar" alt="" />
								{:else}
									<div class="voice-avatar avatar-init">{avatarInitial(m.username)}</div>
								{/if}
								<span class="voice-card-name">{m.username}{m.userId === user.id ? ' (tú)' : ''}</span>
							</div>
						{/each}
					</div>

					<div class="voice-controls-bar">
						<button
							class="ctrl-btn-lg"
							class:active={$micEnabledStore}
							onclick={() => livekitStore.toggleMic()}
						>
							{$micEnabledStore ? '🎙️ Micro activo' : '🔇 Micro silenciado'}
						</button>
						<button class="ctrl-btn-lg danger" onclick={leaveVoice}>
							📵 Desconectar
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	/* ── Layout ─────────────────────────────────────────────────────────── */
	.discord-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		height: 100vh;
		overflow: hidden;
		background: var(--bg-base);
	}

	/* ── Sidebar ─────────────────────────────────────────────────────────── */
	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border-right: 1px solid var(--border);
		overflow: hidden;
	}

	.server-header {
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.server-name-text {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.back-btn {
		font-size: 1rem;
		color: var(--text-muted);
		text-decoration: none;
		padding: 0.25rem;
		border-radius: var(--radius);
		transition: color var(--transition);
		flex-shrink: 0;
	}

	.back-btn:hover { color: var(--text-primary); }

	.channel-nav {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0.5rem;
	}

	.channel-category {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		text-transform: uppercase;
		padding: 0.6rem 0.5rem 0.25rem;
	}

	.channel-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
		transition: background var(--transition), color var(--transition);
		font-family: inherit;
		position: relative;
	}

	.channel-btn:hover { background: rgba(255,255,255,0.06); color: var(--text-secondary); }
	.channel-btn.active { background: rgba(255,255,255,0.1); color: var(--text-primary); }

	.ch-prefix { flex-shrink: 0; font-size: 0.9rem; opacity: 0.7; }
	.ch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.voice-dot {
		width: 7px; height: 7px;
		border-radius: 50%;
		background: #22c55e;
		flex-shrink: 0;
	}

	.voice-participants-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding-left: 1.5rem;
		margin-bottom: 0.15rem;
	}

	.voice-participant-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.15rem 0.5rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.vp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* User area */
	.user-area {
		flex-shrink: 0;
		padding: 0.6rem 0.75rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.voice-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.35rem 0.5rem;
		background: rgba(34,197,94,0.1);
		border-radius: var(--radius);
		border: 1px solid rgba(34,197,94,0.2);
	}

	.voice-status-label { font-size: 0.72rem; color: #4ade80; }

	.voice-status-actions { display: flex; gap: 0.25rem; }

	.ctrl-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		padding: 0.2rem 0.3rem;
		border-radius: var(--radius);
		opacity: 0.6;
		transition: opacity var(--transition), background var(--transition);
	}

	.ctrl-btn:hover { opacity: 1; background: rgba(255,255,255,0.08); }
	.ctrl-btn.active { opacity: 1; }
	.ctrl-btn.danger:hover { background: rgba(239,68,68,0.15); }

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.username-text { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }

	/* ── Main content ────────────────────────────────────────────────────── */
	.main-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.content-header {
		height: 48px;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 1.25rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.header-prefix { font-size: 1rem; color: var(--text-muted); }
	.header-name { font-size: 0.9rem; color: var(--text-primary); }

	/* ── Messages ────────────────────────────────────────────────────────── */
	.messages-area {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.loading, .empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.welcome-message {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 2rem 0 1rem;
	}

	.welcome-icon {
		font-size: 3rem;
		font-weight: 900;
		color: var(--text-muted);
		background: var(--bg-elevated);
		width: 64px; height: 64px;
		display: flex; align-items: center; justify-content: center;
		border-radius: 50%;
		margin-bottom: 1rem;
	}

	.welcome-message h3 { font-size: 1.25rem; color: var(--text-primary); margin-bottom: 0.25rem; }
	.welcome-message p { font-size: 0.85rem; color: var(--text-secondary); }

	.date-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0 0.5rem;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.date-divider::before, .date-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.message {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 0 0.75rem;
		padding: 0.2rem 0;
		border-radius: var(--radius);
		transition: background var(--transition);
	}

	.message:hover { background: rgba(255,255,255,0.025); }
	.message:not(.compact) { padding-top: 0.5rem; }

	.avatar-col {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 0.1rem;
	}

	.compact-spacer { height: 0; }

	.msg-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }

	.msg-header { display: flex; align-items: baseline; gap: 0.4rem; }

	.msg-author { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }

	.msg-time { font-size: 0.68rem; color: var(--text-muted); }

	.msg-edited { font-size: 0.65rem; color: var(--text-muted); }

	.msg-content {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
		word-break: break-word;
		white-space: pre-wrap;
	}

	.attachment { margin-top: 0.25rem; }

	.att-img {
		max-width: 400px;
		max-height: 300px;
		border-radius: var(--radius);
		display: block;
	}

	.att-file {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--accent);
		text-decoration: none;
		padding: 0.35rem 0.6rem;
		background: var(--bg-elevated);
		border-radius: var(--radius);
		border: 1px solid var(--border);
	}

	.att-size { color: var(--text-muted); font-size: 0.7rem; }

	/* ── Message input ───────────────────────────────────────────────────── */
	.input-area {
		padding: 0 1rem 1rem;
		flex-shrink: 0;
	}

	.input-box {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.4rem 0.5rem;
		transition: border-color var(--transition);
	}

	.input-box:focus-within { border-color: var(--border-focus); }

	.attach-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.1rem 0.2rem;
		border-radius: var(--radius);
		transition: color var(--transition);
		flex-shrink: 0;
		line-height: 1;
	}

	.attach-btn:hover { color: var(--text-primary); }

	.hidden-file { display: none; }

	.msg-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text-primary);
		font-size: 0.875rem;
		resize: none;
		max-height: 120px;
		line-height: 1.5;
		font-family: inherit;
	}

	.msg-input::placeholder { color: var(--text-muted); }

	.send-btn {
		background: var(--accent);
		border: none;
		color: var(--accent-text);
		width: 28px;
		height: 28px;
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity var(--transition);
	}

	.send-btn:disabled { opacity: 0.35; cursor: default; }
	.send-btn:not(:disabled):hover { opacity: 0.85; }

	/* ── Voice view ──────────────────────────────────────────────────────── */
	.voice-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 2rem;
	}

	.voice-join-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
	}

	.voice-icon-big { font-size: 3rem; }

	.voice-join-prompt h3 { font-size: 1.25rem; color: var(--text-primary); }
	.voice-join-prompt p { font-size: 0.85rem; color: var(--text-muted); }

	.voice-participants-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		max-width: 640px;
	}

	.voice-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.25rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		min-width: 120px;
	}

	.voice-card.is-you { border-color: var(--accent); }

	.voice-avatar {
		width: 64px; height: 64px;
		border-radius: 50%;
		object-fit: cover;
		font-size: 1.5rem;
		display: flex; align-items: center; justify-content: center;
	}

	.voice-card-name { font-size: 0.82rem; color: var(--text-secondary); }

	.voice-controls-bar {
		display: flex;
		gap: 0.75rem;
	}

	.ctrl-btn-lg {
		padding: 0.6rem 1.25rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		font-family: inherit;
		transition: background var(--transition), color var(--transition);
	}

	.ctrl-btn-lg.active { background: rgba(99,102,241,0.15); border-color: var(--accent); color: var(--accent); }
	.ctrl-btn-lg.danger { color: #f87171; border-color: rgba(239,68,68,0.3); }
	.ctrl-btn-lg.danger:hover { background: rgba(239,68,68,0.1); }

	/* ── Avatars ─────────────────────────────────────────────────────────── */
	.avatar-xs {
		width: 16px; height: 16px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar-sm {
		width: 28px; height: 28px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar-msg {
		width: 36px; height: 36px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar-init {
		background: var(--bg-elevated);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.75em;
		flex-shrink: 0;
	}

	.avatar-xs.avatar-init { font-size: 0.5rem; }
	.avatar-sm.avatar-init { font-size: 0.7rem; }
	.avatar-msg.avatar-init { font-size: 0.9rem; }

	/* ── Btn primary ────────────────────────────────────────────────────── */
	.btn-primary {
		padding: 0.5rem 1.25rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 700;
		font-family: inherit;
		transition: opacity var(--transition);
	}

	.btn-primary:hover { opacity: 0.85; }
</style>

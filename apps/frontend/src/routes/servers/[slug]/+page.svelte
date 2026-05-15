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
	interface Member {
		joinedAt: string;
		user: { id: string; username: string; avatarUrl?: string | null };
		role?: { id: string; name: string; color?: string | null } | null;
	}

	// ── Permissions ────────────────────────────────────────────────────────
	const isOwner = server.ownerId === user.id;
	const isSuperAdmin = user.role === 'SUPERADMIN';
	const canManage = isOwner || isSuperAdmin;

	// ── State ──────────────────────────────────────────────────────────────
	let channels = $state<Channel[]>([...server.channels]);
	let selectedChannel = $state<Channel | null>(null);
	let messages = $state<MessagePayload[]>([]);
	let messagesLoading = $state(false);
	let voiceChannelId = $state<string | null>(null);
	let voiceMembers = $state<Map<string, VoiceMember[]>>(new Map());
	let msgInput = $state('');
	let sendingMsg = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let messagesEl = $state<HTMLDivElement | null>(null);

	// ── Members panel ──────────────────────────────────────────────────────
	let showMembers = $state(false);
	let members = $state<Member[]>([]);
	let membersLoading = $state(false);
	let roles = $state<{ id: string; name: string; color?: string | null; isDefault: boolean }[]>([]);

	// ── Whitelist ──────────────────────────────────────────────────────────
	let whitelist = $state<{ user: { id: string; username: string; avatarUrl?: string | null } }[]>([]);
	let whitelistInput = $state('');
	let whitelistError = $state('');
	let whitelistLoading = $state(false);

	// ── Channel creation ───────────────────────────────────────────────────
	let createChannelType = $state<'TEXT' | 'VOICE' | null>(null);
	let newChannelName = $state('');
	let createChannelLoading = $state(false);

	// ── Message editing ────────────────────────────────────────────────────
	let editingId = $state<string | null>(null);
	let editingContent = $state('');
	let hoveredId = $state<string | null>(null);

	// ── Server settings ────────────────────────────────────────────────────
	let showSettings = $state(false);
	let settingsName = $state(server.name);
	let settingsDesc = $state(server.description ?? '');
	let settingsAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>(server.accessType as any);
	let settingsPassword = $state('');
	let settingsLoading = $state(false);
	let settingsError = $state('');

	// ── Profile dropdown ───────────────────────────────────────────────────
	let showProfile = $state(false);

	// ── Icon upload ────────────────────────────────────────────────────────
	let iconUploadError = $state('');
	let serverIconUrl = $state<string | null>(server.iconUrl ?? null);

	// ── Toast ─────────────────────────────────────────────────────────────
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout>;
	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2500);
	}

	// ── Reactive avatar from auth store ───────────────────────────────────
	const authUser = authStore.user;
	let localAvatarUrl = $state(user.avatarUrl ?? null);
	$effect(() => { if ($authUser?.avatarUrl) localAvatarUrl = $authUser.avatarUrl; });

	// ── Unread counts ──────────────────────────────────────────────────────
	let unread = $state<Map<string, number>>(new Map());
	let totalUnread = $derived([...unread.values()].reduce((a, b) => a + b, 0));

	// ── Roles management ───────────────────────────────────────────────────
	let newRoleName = $state('');
	let newRoleColor = $state('#6366f1');
	let createRoleLoading = $state(false);
	let rolesError = $state('');

	// ── Derived ────────────────────────────────────────────────────────────
	let textChannels = $derived(channels.filter((c) => c.type === 'TEXT'));
	let voiceChannels = $derived(channels.filter((c) => c.type === 'VOICE'));
	let currentVoiceMembers = $derived(voiceChannelId ? (voiceMembers.get(voiceChannelId) ?? []) : []);
	const micEnabledStore = livekitStore.micEnabled;

	// ── Socket setup ───────────────────────────────────────────────────────
	onMount(() => {
		const token = authStore.getSocketToken();
		if (!token) { goto('/login'); return; }
		const socket = socketStore.connect(token);

		socket.on('message:created', (msg) => {
			if (msg.channelId === selectedChannel?.id) {
				messages = [...messages, msg];
				scrollToBottom();
			} else {
				unread = new Map(unread).set(msg.channelId, (unread.get(msg.channelId) ?? 0) + 1);
				playNotificationSound();
			}
		});
		socket.on('message:updated', (msg) => {
			if (msg.channelId !== selectedChannel?.id) return;
			messages = messages.map((m) => (m.id === msg.id ? msg : m));
		});
		socket.on('message:deleted', ({ messageId, channelId }) => {
			if (channelId !== selectedChannel?.id) return;
			messages = messages.filter((m) => m.id !== messageId);
		});
		socket.on('voice:state', ({ channelId, members: m }) => {
			voiceMembers = new Map(voiceMembers).set(channelId, m);
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

		if (textChannels.length > 0) selectChannel(textChannels[0]);

		return () => {
			socket.off('message:created');
			socket.off('message:updated');
			socket.off('message:deleted');
			socket.off('voice:state');
			socket.off('voice:joined');
			socket.off('voice:left');
			if (selectedChannel) socket.emit('channel:leave', { channelId: selectedChannel.id });
			if (voiceChannelId) { socket.emit('voice:leave', { channelId: voiceChannelId }); livekitStore.disconnect(); }
		};
	});

	// ── Channel selection ─────────────────────────────────────────────────
	async function selectChannel(ch: Channel) {
		const socket = socketStore.raw();
		if (!socket) return;
		if (selectedChannel?.id !== ch.id) socket.emit('channel:leave', { channelId: selectedChannel?.id ?? '' });
		selectedChannel = ch;
		unread = new Map(unread).set(ch.id, 0);
		socket.emit('channel:join', { channelId: ch.id });
		if (ch.type === 'TEXT') await loadMessages(ch.id);
	}

	// ── Channel CRUD ──────────────────────────────────────────────────────
	async function createChannel() {
		const name = newChannelName.trim();
		if (!name || !createChannelType || createChannelLoading) return;
		createChannelLoading = true;
		try {
			const res = await fetch(`/api/servers/${server.slug}/channels`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ name, type: createChannelType }),
			});
			if (res.ok) {
				const ch: Channel = await res.json();
				channels = [...channels, ch];
				newChannelName = '';
				createChannelType = null;
				if (ch.type === 'TEXT') selectChannel(ch);
			}
		} finally {
			createChannelLoading = false;
		}
	}

	async function deleteChannel(ch: Channel) {
		if (!confirm(`¿Eliminar #${ch.name}?`)) return;
		const res = await fetch(`/api/servers/${server.slug}/channels/${ch.id}`, {
			method: 'DELETE',
			credentials: 'include',
		});
		if (res.ok) {
			channels = channels.filter((c) => c.id !== ch.id);
			if (selectedChannel?.id === ch.id) {
				const next = textChannels.find((c) => c.id !== ch.id);
				if (next) selectChannel(next); else selectedChannel = null;
			}
		}
	}

	// ── Messages ──────────────────────────────────────────────────────────
	let hasMore = $state(false);
	let loadingMore = $state(false);
	const MSG_LIMIT = 50;

	async function loadMessages(channelId: string) {
		messagesLoading = true;
		messages = [];
		hasMore = false;
		try {
			const res = await fetch(`/api/channels/${channelId}/messages?limit=${MSG_LIMIT}`, { credentials: 'include' });
			if (res.ok) {
				const data = await res.json();
				messages = data;
				hasMore = data.length === MSG_LIMIT;
			}
		} finally {
			messagesLoading = false;
			scrollToBottom();
		}
	}

	async function loadMoreMessages() {
		if (!selectedChannel || loadingMore || !hasMore || messages.length === 0) return;
		loadingMore = true;
		const oldest = messages[0].createdAt;
		try {
			const res = await fetch(`/api/channels/${selectedChannel.id}/messages?limit=${MSG_LIMIT}&before=${encodeURIComponent(oldest)}`, { credentials: 'include' });
			if (res.ok) {
				const older = await res.json();
				if (older.length === 0) { hasMore = false; return; }
				const el = messagesEl;
				const prevHeight = el?.scrollHeight ?? 0;
				messages = [...older, ...messages];
				hasMore = older.length === MSG_LIMIT;
				await Promise.resolve();
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
			method: 'POST', credentials: 'include', body: fd,
		});
	}

	function startEdit(msg: MessagePayload) {
		editingId = msg.id;
		editingContent = msg.content ?? '';
	}

	function cancelEdit() { editingId = null; editingContent = ''; }

	async function submitEdit(msg: MessagePayload) {
		const content = editingContent.trim();
		if (!content || !selectedChannel) return;
		const res = await fetch(`/api/channels/${selectedChannel.id}/messages/${msg.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ content }),
		});
		if (res.ok) cancelEdit();
	}

	async function deleteMsg(msg: MessagePayload) {
		if (!selectedChannel) return;
		await fetch(`/api/channels/${selectedChannel.id}/messages/${msg.id}`, {
			method: 'DELETE', credentials: 'include',
		});
	}

	function onEditKeydown(e: KeyboardEvent, msg: MessagePayload) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(msg); }
		if (e.key === 'Escape') cancelEdit();
	}

	function onFileChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files?.[0]) { sendFile(files[0]); (e.target as HTMLInputElement).value = ''; }
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	}

	// ── Members ───────────────────────────────────────────────────────────
	async function toggleMembers() {
		showMembers = !showMembers;
		if (showMembers && members.length === 0) await loadMembers();
	}

	async function loadMembers() {
		membersLoading = true;
		try {
			const [membersRes, rolesRes] = await Promise.all([
				fetch(`/api/servers/${server.slug}/members`, { credentials: 'include' }),
				roles.length === 0 && canManage ? fetch(`/api/servers/${server.slug}/roles`, { credentials: 'include' }) : Promise.resolve(null),
			]);
			if (membersRes.ok) members = await membersRes.json();
			if (rolesRes?.ok) roles = await rolesRes.json();
		} finally {
			membersLoading = false;
		}
	}

	async function kickMember(userId: string, username: string) {
		if (!confirm(`¿Expulsar a ${username}?`)) return;
		const res = await fetch(`/api/servers/${server.slug}/members/${userId}`, {
			method: 'DELETE', credentials: 'include',
		});
		if (res.ok) members = members.filter((m) => m.user.id !== userId);
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
		selectedChannel = ch;
	}

	async function leaveVoice() {
		if (!voiceChannelId) return;
		const socket = socketStore.raw();
		socket?.emit('voice:leave', { channelId: voiceChannelId });
		livekitStore.disconnect();
		voiceChannelId = null;
		if (textChannels.length > 0) selectChannel(textChannels[0]);
	}

	// ── Server settings ───────────────────────────────────────────────────
	async function openSettings() {
		settingsName = server.name;
		settingsDesc = server.description ?? '';
		settingsAccess = server.accessType as any;
		settingsPassword = '';
		settingsError = '';
		whitelistError = '';
		showSettings = true;
		const [rolesRes, wlRes] = await Promise.all([
			fetch(`/api/servers/${server.slug}/roles`, { credentials: 'include' }),
			server.accessType === 'WHITELIST' ? fetch(`/api/servers/${server.slug}/whitelist`, { credentials: 'include' }) : Promise.resolve(null),
		]);
		if (rolesRes.ok) roles = await rolesRes.json();
		if (wlRes?.ok) whitelist = await wlRes.json();
	}

	async function uploadIcon(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		iconUploadError = '';
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch(`/api/servers/${server.slug}/icon`, {
			method: 'PATCH', credentials: 'include', body: fd,
		});
		if (res.ok) {
			const { iconUrl } = await res.json();
			serverIconUrl = iconUrl;
		} else {
			const err = await res.json().catch(() => ({}));
			iconUploadError = err.message ?? 'Error al subir.';
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function saveSettings(e: SubmitEvent) {
		e.preventDefault();
		settingsError = '';
		settingsLoading = true;
		try {
			const res = await fetch(`/api/servers/${server.slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: settingsName,
					description: settingsDesc || undefined,
					accessType: settingsAccess,
					password: settingsAccess === 'PASSWORD' && settingsPassword ? settingsPassword : undefined,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				settingsError = err.message ?? 'Error al guardar.';
				return;
			}
			showSettings = false;
		} catch {
			settingsError = 'Error de red.';
		} finally {
			settingsLoading = false;
		}
	}

	async function leaveServer() {
		if (!confirm('¿Salir del servidor?')) return;
		const res = await fetch(`/api/servers/${server.slug}/leave`, { method: 'POST', credentials: 'include' });
		if (res.ok) goto('/servers');
	}

	async function deleteServer() {
		if (!confirm(`¿Eliminar permanentemente "${server.name}"? Esto no se puede deshacer.`)) return;
		const res = await fetch(`/api/servers/${server.slug}`, { method: 'DELETE', credentials: 'include' });
		if (res.ok) goto('/servers');
	}

	// ── Whitelist ─────────────────────────────────────────────────────────
	async function addToWhitelist() {
		const username = whitelistInput.trim();
		if (!username || whitelistLoading) return;
		whitelistError = '';
		whitelistLoading = true;
		try {
			const res = await fetch(`/api/servers/${server.slug}/whitelist`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				whitelistError = err.message ?? 'Error.';
				return;
			}
			whitelistInput = '';
			const wlRes = await fetch(`/api/servers/${server.slug}/whitelist`, { credentials: 'include' });
			if (wlRes.ok) whitelist = await wlRes.json();
		} finally {
			whitelistLoading = false;
		}
	}

	async function removeFromWhitelist(userId: string) {
		await fetch(`/api/servers/${server.slug}/whitelist/${userId}`, { method: 'DELETE', credentials: 'include' });
		whitelist = whitelist.filter((w) => w.user.id !== userId);
	}

	// ── Roles CRUD ────────────────────────────────────────────────────────
	async function createRole() {
		const name = newRoleName.trim();
		if (!name || createRoleLoading) return;
		rolesError = '';
		createRoleLoading = true;
		try {
			const res = await fetch(`/api/servers/${server.slug}/roles`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ name, color: newRoleColor }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				rolesError = err.message ?? 'Error.';
				return;
			}
			const role = await res.json();
			roles = [...roles, role];
			newRoleName = '';
			newRoleColor = '#6366f1';
		} finally {
			createRoleLoading = false;
		}
	}

	async function deleteRole(roleId: string) {
		if (!confirm('¿Eliminar este rol?')) return;
		const res = await fetch(`/api/servers/${server.slug}/roles/${roleId}`, {
			method: 'DELETE', credentials: 'include',
		});
		if (res.ok) roles = roles.filter((r) => r.id !== roleId);
	}

	// ── Role assignment ───────────────────────────────────────────────────
	async function assignRole(userId: string, roleId: string | null) {
		const res = await fetch(`/api/servers/${server.slug}/members/${userId}/role`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ roleId }),
		});
		if (res.ok) {
			const role = roleId ? roles.find((r) => r.id === roleId) : null;
			members = members.map((m) =>
				m.user.id === userId ? { ...m, role: role ? { id: role.id, name: role.name, color: role.color ?? null } : null } : m
			);
		}
	}

	// ── Profile ───────────────────────────────────────────────────────────
	async function uploadAvatar(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		showProfile = false;
		await authStore.updateAvatar(file);
		(e.target as HTMLInputElement).value = '';
	}

	async function handleLogout() {
		socketStore.disconnect();
		livekitStore.disconnect();
		await authStore.logout();
		goto('/login');
	}

	// ── Helpers ───────────────────────────────────────────────────────────
	async function copyInviteLink() {
		const url = `${location.origin}/servers/${server.slug}`;
		await navigator.clipboard.writeText(url).catch(() => {});
		showToast('Enlace copiado');
	}

	function playNotificationSound() {
		try {
			const ctx = new AudioContext();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.frequency.value = 880;
			osc.type = 'sine';
			gain.gain.setValueAtTime(0.08, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
			osc.start(ctx.currentTime);
			osc.stop(ctx.currentTime + 0.18);
			osc.onended = () => ctx.close();
		} catch { /* AudioContext blocked */ }
	}

	function scrollToBottom() {
		setTimeout(() => { if (messagesEl) messagesEl!.scrollTop = messagesEl!.scrollHeight; }, 50);
	}

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	const avatarInitial = (u: string) => u[0].toUpperCase();

	function fileSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const isImage = (mime: string) => mime.startsWith('image/');

	function canEditMsg(msg: MessagePayload) { return msg.author.id === user.id; }
	function canDeleteMsg(msg: MessagePayload) { return msg.author.id === user.id || canManage; }
</script>

<svelte:head><title>{totalUnread > 0 ? `(${totalUnread}) ` : ''}{server.name} — Meado</title></svelte:head>

<div class="discord-layout" class:show-members={showMembers}>
	<!-- ── Sidebar ───────────────────────────────────────────────────────── -->
	<aside class="sidebar">
		<div class="server-header">
			<span class="server-name-text">{server.name}</span>
			<div class="server-header-actions">
				<button class="icon-btn" title="Copiar enlace" onclick={copyInviteLink}>🔗</button>
				{#if canManage}
					<button class="icon-btn" title="Configuración" onclick={openSettings}>⚙️</button>
				{/if}
				<a href="/servers" class="icon-btn" title="Volver">←</a>
			</div>
		</div>

		<nav class="channel-nav">
			<!-- TEXT -->
			<div class="channel-category">
				<span>TEXTO</span>
				{#if canManage}
					<button class="cat-add-btn" title="Crear canal de texto" onclick={() => { createChannelType = 'TEXT'; newChannelName = ''; }}>+</button>
				{/if}
			</div>

			{#if createChannelType === 'TEXT'}
				<div class="create-channel-inline">
					<input
						class="create-ch-input"
						placeholder="nombre-canal"
						bind:value={newChannelName}
						onkeydown={(e) => { if (e.key === 'Enter') createChannel(); if (e.key === 'Escape') createChannelType = null; }}
						autofocus
					/>
					<div class="create-ch-actions">
						<button class="ch-action-cancel" onclick={() => (createChannelType = null)}>Esc</button>
						<button class="ch-action-ok" onclick={createChannel} disabled={createChannelLoading}>✓</button>
					</div>
				</div>
			{/if}

			{#each textChannels as ch (ch.id)}
				<div class="channel-row" class:active={selectedChannel?.id === ch.id}>
					<button class="channel-btn" onclick={() => selectChannel(ch)}>
						<span class="ch-prefix">#</span>
						<span class="ch-name">{ch.name}</span>
						{#if (unread.get(ch.id) ?? 0) > 0}
							<span class="unread-badge">{unread.get(ch.id)}</span>
						{/if}
					</button>
					{#if canManage}
						<button class="ch-del-btn" title="Eliminar canal" onclick={() => deleteChannel(ch)}>✕</button>
					{/if}
				</div>
			{/each}

			<!-- VOICE -->
			<div class="channel-category">
				<span>VOZ</span>
				{#if canManage}
					<button class="cat-add-btn" title="Crear canal de voz" onclick={() => { createChannelType = 'VOICE'; newChannelName = ''; }}>+</button>
				{/if}
			</div>

			{#if createChannelType === 'VOICE'}
				<div class="create-channel-inline">
					<input
						class="create-ch-input"
						placeholder="nombre-canal"
						bind:value={newChannelName}
						onkeydown={(e) => { if (e.key === 'Enter') createChannel(); if (e.key === 'Escape') createChannelType = null; }}
						autofocus
					/>
					<div class="create-ch-actions">
						<button class="ch-action-cancel" onclick={() => (createChannelType = null)}>Esc</button>
						<button class="ch-action-ok" onclick={createChannel} disabled={createChannelLoading}>✓</button>
					</div>
				</div>
			{/if}

			{#each voiceChannels as ch (ch.id)}
				<div class="channel-row" class:active={voiceChannelId === ch.id}>
					<button class="channel-btn" onclick={() => joinVoiceChannel(ch)}>
						<span class="ch-prefix">🔊</span>
						<span class="ch-name">{ch.name}</span>
						{#if voiceChannelId === ch.id}<span class="voice-dot"></span>{/if}
					</button>
					{#if canManage}
						<button class="ch-del-btn" title="Eliminar canal" onclick={() => deleteChannel(ch)}>✕</button>
					{/if}
				</div>
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
		</nav>

		<!-- User area -->
		<div class="user-area">
			{#if voiceChannelId}
				<div class="voice-status">
					<span class="voice-status-label">🟢 En voz</span>
					<div class="voice-status-actions">
						<button class="ctrl-btn" class:active={$micEnabledStore} title={$micEnabledStore ? 'Silenciar' : 'Activar micro'} onclick={() => livekitStore.toggleMic()}>
							{$micEnabledStore ? '🎙️' : '🔇'}
						</button>
						<button class="ctrl-btn danger" title="Desconectar" onclick={leaveVoice}>📵</button>
					</div>
				</div>
			{/if}
			<div class="user-info-row">
				<button class="user-info" onclick={() => (showProfile = !showProfile)} title="Perfil">
					{#if localAvatarUrl}
						<img src={localAvatarUrl} class="avatar-sm" alt="" />
					{:else}
						<div class="avatar-sm avatar-init">{avatarInitial(user.username)}</div>
					{/if}
					<span class="username-text">{user.username}</span>
				</button>
				{#if showProfile}
					<div class="profile-menu" role="menu">
						<label class="profile-menu-item">
							Cambiar avatar
							<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden-file" onchange={uploadAvatar} />
						</label>
						<button class="profile-menu-item danger" onclick={handleLogout}>Cerrar sesión</button>
					</div>
				{/if}
			</div>
		</div>
	</aside>

	<!-- ── Main content ───────────────────────────────────────────────────── -->
	<main class="main-content">
		{#if !selectedChannel}
			<div class="empty-state">Selecciona un canal</div>

		{:else if selectedChannel.type === 'TEXT'}
			<div class="content-header">
				<span class="header-prefix">#</span>
				<strong class="header-name">{selectedChannel.name}</strong>
				<div class="header-actions">
					<button class="icon-btn" class:active={showMembers} title="Miembros" onclick={toggleMembers}>👥</button>
				</div>
			</div>

			<div class="messages-area" bind:this={messagesEl} onscroll={onMessagesScroll}>
				{#if messagesLoading}
					<div class="loading">Cargando mensajes…</div>
				{:else if messages.length === 0}
					<div class="welcome-message">
						<div class="welcome-icon">#</div>
						<h3>Bienvenido a #{selectedChannel.name}</h3>
						<p>Este es el inicio del canal.</p>
					</div>
				{:else}
					{#if loadingMore}
						<div class="loading-more">Cargando más…</div>
					{:else if !hasMore && messages.length > 0}
						<div class="channel-start">Inicio de #{selectedChannel.name}</div>
					{/if}
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
									{#if editingId === msg.id}
										<div class="edit-box">
											<textarea class="edit-input" bind:value={editingContent} onkeydown={(e) => onEditKeydown(e, msg)} rows="2" autofocus></textarea>
											<div class="edit-actions">
												<button class="edit-cancel" onclick={cancelEdit}>Cancelar</button>
												<button class="edit-save" onclick={() => submitEdit(msg)}>Guardar</button>
											</div>
										</div>
									{:else}
										{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
									{/if}
									{#each msg.attachments as att (att.id)}
										<div class="attachment">
											{#if isImage(att.mimeType)}
												<img src={att.url} class="att-img" alt={att.name} />
											{:else}
												<a href={att.url} target="_blank" class="att-file">📎 {att.name} <span class="att-size">({fileSize(att.size)})</span></a>
											{/if}
										</div>
									{/each}
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
											<textarea class="edit-input" bind:value={editingContent} onkeydown={(e) => onEditKeydown(e, msg)} rows="2" autofocus></textarea>
											<div class="edit-actions">
												<button class="edit-cancel" onclick={cancelEdit}>Cancelar</button>
												<button class="edit-save" onclick={() => submitEdit(msg)}>Guardar</button>
											</div>
										</div>
									{:else}
										{#if msg.content}<p class="msg-content">{msg.content}</p>{/if}
									{/if}
									{#each msg.attachments as att (att.id)}
										<div class="attachment">
											{#if isImage(att.mimeType)}
												<img src={att.url} class="att-img" alt={att.name} />
											{:else}
												<a href={att.url} target="_blank" class="att-file">📎 {att.name} <span class="att-size">({fileSize(att.size)})</span></a>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							<!-- Hover actions -->
							{#if hoveredId === msg.id && editingId !== msg.id}
								<div class="msg-actions">
									{#if canEditMsg(msg)}<button class="msg-action-btn" title="Editar" onclick={() => startEdit(msg)}>✏️</button>{/if}
									{#if canDeleteMsg(msg)}<button class="msg-action-btn danger" title="Eliminar" onclick={() => deleteMsg(msg)}>🗑️</button>{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<div class="input-area">
				<div class="input-box">
					<button class="attach-btn" title="Adjuntar archivo" onclick={() => fileInput?.click()}>+</button>
					<input class="hidden-file" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" bind:this={fileInput} onchange={onFileChange} />
					<textarea class="msg-input" placeholder="Escribir en #{selectedChannel.name}" bind:value={msgInput} onkeydown={onKeydown} rows="1"></textarea>
					<button class="send-btn" disabled={!msgInput.trim() || sendingMsg} onclick={() => sendMessage()}>↑</button>
				</div>
			</div>

		{:else if selectedChannel.type === 'VOICE'}
			<div class="content-header">
				<span class="header-prefix">🔊</span>
				<strong class="header-name">{selectedChannel.name}</strong>
				<div class="header-actions">
					<button class="icon-btn" class:active={showMembers} title="Miembros" onclick={toggleMembers}>👥</button>
				</div>
			</div>

			<div class="voice-view">
				{#if voiceChannelId !== selectedChannel.id}
					<div class="voice-join-prompt">
						<div class="voice-icon-big">🔊</div>
						<h3>{selectedChannel.name}</h3>
						<p>{(voiceMembers.get(selectedChannel.id) ?? []).length} participante(s)</p>
						<button class="btn-primary" onclick={() => selectedChannel && joinVoiceChannel(selectedChannel)}>Unirse al canal de voz</button>
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
						<button class="ctrl-btn-lg" class:active={$micEnabledStore} onclick={() => livekitStore.toggleMic()}>
							{$micEnabledStore ? '🎙️ Micro activo' : '🔇 Micro silenciado'}
						</button>
						<button class="ctrl-btn-lg danger" onclick={leaveVoice}>📵 Desconectar</button>
					</div>
				{/if}
			</div>
		{/if}
	</main>

	<!-- ── Settings modal ───────────────────────────────────────────────── -->
	{#if showSettings}
		<div class="modal-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showSettings = false; }} onkeydown={(e) => { if (e.key === 'Escape') showSettings = false; }}>
			<div class="settings-modal">
				<div class="settings-header">
					<h3>Configuración de {server.name}</h3>
					<button class="icon-btn" onclick={() => (showSettings = false)}>✕</button>
				</div>
				<div class="settings-icon-section">
					<div class="server-icon-preview">
						{#if serverIconUrl}
							<img src={serverIconUrl} alt="" class="server-icon-img" />
						{:else}
							<span class="server-icon-initial">{server.name[0].toUpperCase()}</span>
						{/if}
					</div>
					<label class="icon-upload-label">
						<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden-file" onchange={uploadIcon} />
						Cambiar icono
					</label>
					{#if iconUploadError}<p class="error">{iconUploadError}</p>{/if}
				</div>
				<form class="settings-body" onsubmit={saveSettings}>
					<label>
						Nombre del servidor
						<input type="text" bind:value={settingsName} required />
					</label>
					<label>
						Descripción
						<input type="text" bind:value={settingsDesc} placeholder="Opcional" />
					</label>
					<label>
						Acceso
						<select bind:value={settingsAccess}>
							<option value="PUBLIC">🌐 Público</option>
							<option value="PASSWORD">🔒 Contraseña</option>
							<option value="WHITELIST">📋 Lista blanca</option>
						</select>
					</label>
					{#if settingsAccess === 'PASSWORD'}
						<label>
							Nueva contraseña <span class="optional">(dejar vacío para no cambiar)</span>
							<input type="password" bind:value={settingsPassword} placeholder="Nueva contraseña" />
						</label>
					{/if}
					{#if settingsError}<p class="error">{settingsError}</p>{/if}
					<button type="submit" class="btn-primary" disabled={settingsLoading}>
						{settingsLoading ? 'Guardando…' : 'Guardar cambios'}
					</button>
				</form>
				<div class="settings-roles">
					<p class="settings-section-title">Roles</p>
					{#each roles.filter((r) => !r.isDefault) as r (r.id)}
						<div class="role-row">
							<span class="role-swatch" style="background: {r.color ?? '#6b7280'}"></span>
							<span class="role-row-name">{r.name}</span>
							<button type="button" class="wl-remove-btn" onclick={() => deleteRole(r.id)}>✕</button>
						</div>
					{/each}
					<div class="role-create-row">
						<input type="color" bind:value={newRoleColor} class="color-picker" title="Color del rol" />
						<input
							type="text"
							placeholder="Nombre del rol"
							bind:value={newRoleName}
							class="role-name-input"
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createRole(); } }}
						/>
						<button type="button" class="btn-primary btn-sm" onclick={createRole} disabled={createRoleLoading}>
							{createRoleLoading ? '…' : 'Crear'}
						</button>
					</div>
					{#if rolesError}<p class="error">{rolesError}</p>{/if}
				</div>

				{#if settingsAccess === 'WHITELIST'}
					<div class="settings-whitelist">
						<p class="settings-section-title">Lista blanca</p>
						<div class="whitelist-add-row">
							<input
								type="text"
								placeholder="Nombre de usuario"
								bind:value={whitelistInput}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToWhitelist(); } }}
							/>
							<button type="button" class="btn-primary btn-sm" onclick={addToWhitelist} disabled={whitelistLoading}>
								{whitelistLoading ? '…' : 'Añadir'}
							</button>
						</div>
						{#if whitelistError}<p class="error">{whitelistError}</p>{/if}
						{#if whitelist.length > 0}
							<ul class="whitelist-list">
								{#each whitelist as entry (entry.user.id)}
									<li class="whitelist-item">
										<div class="wl-avatar-sm">
											{#if entry.user.avatarUrl}
												<img src={entry.user.avatarUrl} class="avatar-xs" alt="" />
											{:else}
												<div class="avatar-xs avatar-init">{avatarInitial(entry.user.username)}</div>
											{/if}
										</div>
										<span class="wl-name">{entry.user.username}</span>
										<button type="button" class="wl-remove-btn" onclick={() => removeFromWhitelist(entry.user.id)}>✕</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="wl-empty">Ningún usuario en lista blanca.</p>
						{/if}
					</div>
				{/if}

				<div class="settings-danger">
					<p class="danger-title">Zona de peligro</p>
					{#if !isOwner}
						<button class="btn-danger-outline" onclick={leaveServer}>Salir del servidor</button>
					{/if}
					{#if canManage}
						<button class="btn-danger-solid" onclick={deleteServer}>Eliminar servidor</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Members panel ──────────────────────────────────────────────────── -->
	{#if showMembers}
		<aside class="members-panel">
			<div class="members-header">Miembros — {members.length}</div>
			{#if membersLoading}
				<div class="members-loading">Cargando…</div>
			{:else}
				<ul class="members-list">
					{#each members as m (m.user.id)}
						<li class="member-item">
							{#if m.user.avatarUrl}
								<img src={m.user.avatarUrl} class="avatar-sm" alt="" />
							{:else}
								<div class="avatar-sm avatar-init">{avatarInitial(m.user.username)}</div>
							{/if}
							<div class="member-info">
								<span class="member-name">{m.user.username}</span>
								{#if canManage && roles.length > 0 && m.user.id !== user.id}
									<select
										class="role-select"
										value={m.role?.id ?? ''}
										onchange={(e) => assignRole(m.user.id, (e.target as HTMLSelectElement).value || null)}
									>
										<option value="">Sin rol</option>
										{#each roles as r (r.id)}
											<option value={r.id}>{r.name}</option>
										{/each}
									</select>
								{:else if m.role}
									<span class="member-role" style="color: {m.role.color ?? 'var(--text-muted)'}">
										{m.role.name}
									</span>
								{/if}
							</div>
							{#if canManage && m.user.id !== user.id}
								<button class="kick-btn" title="Expulsar" onclick={() => kickMember(m.user.id, m.user.username)}>✕</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}

	{#if toast}
		<div class="toast">{toast}</div>
	{/if}
</div>

<style>
	/* ── Layout ──────────────────────────────────────────────────────────── */
	.discord-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		grid-template-rows: 100vh;
		overflow: hidden;
		background: var(--bg-base);
	}

	.discord-layout.show-members {
		grid-template-columns: 240px 1fr 200px;
	}

	/* ── Sidebar ─────────────────────────────────────────────────────────── */
	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border-right: 1px solid var(--border);
		overflow: hidden;
		min-height: 0;
	}

	.server-header {
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.75rem 0 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.server-name-text {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.icon-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.3rem 0.4rem;
		border-radius: var(--radius);
		font-size: 0.85rem;
		line-height: 1;
		text-decoration: none;
		transition: color var(--transition), background var(--transition);
		display: flex;
		align-items: center;
	}

	.icon-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.07); }
	.icon-btn.active { color: var(--accent); background: rgba(99,102,241,0.12); }

	.channel-nav {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0.4rem;
		min-height: 0;
	}

	.channel-category {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		text-transform: uppercase;
		padding: 0.6rem 0.5rem 0.2rem;
	}

	.cat-add-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0 0.2rem;
		border-radius: 3px;
		transition: color var(--transition);
	}

	.cat-add-btn:hover { color: var(--text-primary); }

	.channel-row {
		display: flex;
		align-items: center;
		border-radius: var(--radius);
		transition: background var(--transition);
		position: relative;
	}

	.channel-row:hover { background: rgba(255,255,255,0.05); }
	.channel-row.active { background: rgba(255,255,255,0.1); }
	.channel-row:hover .ch-del-btn { opacity: 1; }

	.channel-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
		font-family: inherit;
	}

	.channel-row:hover .channel-btn { color: var(--text-secondary); }
	.channel-row.active .channel-btn { color: var(--text-primary); }

	.ch-prefix { flex-shrink: 0; opacity: 0.7; }
	.ch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.ch-del-btn {
		opacity: 0;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.65rem;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		transition: color var(--transition), opacity var(--transition);
		flex-shrink: 0;
	}

	.ch-del-btn:hover { color: var(--error); }

	.voice-dot {
		width: 7px; height: 7px;
		border-radius: 50%;
		background: #22c55e;
		flex-shrink: 0;
	}

	/* Create channel inline */
	.create-channel-inline {
		padding: 0.3rem 0.4rem;
	}

	.create-ch-input {
		width: 100%;
		font-size: 0.8rem;
		padding: 0.3rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		font-family: inherit;
		box-sizing: border-box;
	}

	.create-ch-actions {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.3rem;
		justify-content: flex-end;
	}

	.ch-action-cancel {
		font-size: 0.7rem;
		padding: 0.15rem 0.4rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
	}

	.ch-action-ok {
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		background: var(--accent);
		border: none;
		border-radius: var(--radius);
		color: var(--accent-text);
		cursor: pointer;
		font-family: inherit;
	}

	.ch-action-ok:disabled { opacity: 0.45; }

	/* Voice participants sidebar */
	.voice-participants-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding-left: 1.5rem;
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

	/* ── Main content ─────────────────────────────────────────────────────── */
	.main-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	.content-header {
		height: 48px;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.75rem 0 1.25rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.header-prefix { font-size: 1rem; color: var(--text-muted); }
	.header-name { font-size: 0.9rem; color: var(--text-primary); flex: 1; }
	.header-actions { display: flex; gap: 0.25rem; margin-left: auto; }

	/* ── Messages ─────────────────────────────────────────────────────────── */
	.messages-area {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
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
		flex-shrink: 0;
	}

	.date-divider::before, .date-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.message {
		display: grid;
		grid-template-columns: 40px 1fr auto;
		gap: 0 0.75rem;
		padding: 0.1rem 0.5rem;
		border-radius: var(--radius);
		transition: background var(--transition);
		position: relative;
		flex-shrink: 0;
	}

	.message:not(.compact) { padding-top: 0.5rem; }
	.message:hover { background: rgba(255,255,255,0.025); }

	.avatar-col {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 0.1rem;
	}

	.compact-spacer {
		align-items: center;
		justify-content: flex-end;
		padding-right: 0.1rem;
	}

	.compact-time {
		font-size: 0.6rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

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
		margin: 0;
	}

	.msg-actions {
		display: flex;
		gap: 0.15rem;
		align-items: flex-start;
		padding-top: 0.1rem;
		flex-shrink: 0;
	}

	.msg-action-btn {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0.15rem 0.3rem;
		transition: background var(--transition), border-color var(--transition);
		line-height: 1.3;
	}

	.msg-action-btn:hover { background: var(--bg-surface); border-color: var(--border-strong); }
	.msg-action-btn.danger:hover { border-color: var(--error); }

	/* Edit box */
	.edit-box {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.1rem;
	}

	.edit-input {
		width: 100%;
		font-size: 0.875rem;
		padding: 0.4rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		resize: none;
		font-family: inherit;
		line-height: 1.5;
		box-sizing: border-box;
	}

	.edit-actions {
		display: flex;
		gap: 0.4rem;
		font-size: 0.72rem;
	}

	.edit-cancel {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.72rem;
		padding: 0;
	}

	.edit-cancel:hover { color: var(--text-primary); }

	.edit-save {
		background: var(--accent);
		border: none;
		color: var(--accent-text);
		border-radius: var(--radius);
		padding: 0.2rem 0.6rem;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.72rem;
	}

	/* Attachments */
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

	/* ── Message input ────────────────────────────────────────────────────── */
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
		width: 28px; height: 28px;
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

	/* ── Voice view ───────────────────────────────────────────────────────── */
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
		display: flex; align-items: center; justify-content: center;
	}

	.voice-card-name { font-size: 0.82rem; color: var(--text-secondary); }

	.voice-controls-bar { display: flex; gap: 0.75rem; }

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

	/* ── Members panel ────────────────────────────────────────────────────── */
	.members-panel {
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border-left: 1px solid var(--border);
		overflow: hidden;
	}

	.members-header {
		height: 48px;
		display: flex;
		align-items: center;
		padding: 0 1rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.members-loading {
		padding: 1rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.members-list {
		list-style: none;
		overflow-y: auto;
		padding: 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.member-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius);
		transition: background var(--transition);
	}

	.member-item:hover { background: rgba(255,255,255,0.05); }
	.member-item:hover .kick-btn { opacity: 1; }

	.member-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}

	.member-name {
		font-size: 0.82rem;
		color: var(--text-secondary);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-role {
		font-size: 0.65rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.kick-btn {
		opacity: 0;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.65rem;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		transition: color var(--transition), opacity var(--transition);
		flex-shrink: 0;
	}

	.kick-btn:hover { color: var(--error); }

	/* ── Avatars ──────────────────────────────────────────────────────────── */
	.avatar-xs { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.avatar-sm { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.avatar-msg { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }

	.avatar-init {
		background: var(--bg-elevated);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
	}

	.avatar-xs.avatar-init { font-size: 0.5rem; }
	.avatar-sm.avatar-init { font-size: 0.7rem; }
	.avatar-msg.avatar-init { font-size: 0.9rem; }
	.voice-avatar.avatar-init { font-size: 1.5rem; }

	/* ── Btn primary ──────────────────────────────────────────────────────── */
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
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

	/* ── Server header actions ───────────────────────────────────────────── */
	.server-header-actions { display: flex; align-items: center; gap: 0.1rem; }

	/* ── Profile ─────────────────────────────────────────────────────────── */
	.user-info-row { position: relative; }

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		background: transparent;
		border: none;
		cursor: pointer;
		border-radius: var(--radius);
		padding: 0.3rem 0.4rem;
		transition: background var(--transition);
		font-family: inherit;
	}

	.user-info:hover { background: rgba(255,255,255,0.06); }

	.profile-menu {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		right: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 0.3rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.profile-menu-item {
		background: transparent;
		border: none;
		padding: 0.45rem 0.75rem;
		font-size: 0.82rem;
		text-align: left;
		border-radius: var(--radius);
		cursor: pointer;
		font-family: inherit;
		color: var(--text-secondary);
		transition: background var(--transition), color var(--transition);
	}

	.profile-menu-item:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
	.profile-menu-item.danger { color: #f87171; }
	.profile-menu-item.danger:hover { background: rgba(239,68,68,0.12); }

	/* ── Settings modal ──────────────────────────────────────────────────── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.settings-modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.settings-header h3 { font-size: 0.9rem; color: var(--text-primary); }

	.settings-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
	}

	.settings-body label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.settings-body input,
	.settings-body select {
		font-size: 0.85rem;
		padding: 0.4rem 0.6rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		font-family: inherit;
		transition: border-color var(--transition);
	}

	.settings-body input:focus,
	.settings-body select:focus { border-color: var(--border-focus); }

	.optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text-muted); }

	.error { font-size: 0.75rem; color: var(--error); }

	.settings-danger {
		padding: 1rem 1.25rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.danger-title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #f87171;
		margin: 0 0 0.25rem;
	}

	.btn-danger-outline {
		padding: 0.4rem 0.85rem;
		background: transparent;
		border: 1px solid rgba(239,68,68,0.4);
		border-radius: var(--radius);
		color: #f87171;
		font-size: 0.82rem;
		font-family: inherit;
		cursor: pointer;
		transition: background var(--transition), border-color var(--transition);
		text-align: left;
	}

	.btn-danger-outline:hover { background: rgba(239,68,68,0.1); border-color: #f87171; }

	.btn-danger-solid {
		padding: 0.4rem 0.85rem;
		background: rgba(239,68,68,0.15);
		border: 1px solid rgba(239,68,68,0.4);
		border-radius: var(--radius);
		color: #f87171;
		font-size: 0.82rem;
		font-family: inherit;
		cursor: pointer;
		transition: background var(--transition);
		text-align: left;
	}

	.btn-danger-solid:hover { background: rgba(239,68,68,0.25); }

	/* ── Role select in members panel ───────────────────────────────────── */
	.role-select {
		font-size: 0.65rem;
		padding: 0.1rem 0.25rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		outline: none;
		font-family: inherit;
		cursor: pointer;
		max-width: 100%;
	}

	/* ── Whitelist section in settings ──────────────────────────────────── */
	.settings-whitelist {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.settings-section-title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		margin: 0;
	}

	.whitelist-add-row {
		display: flex;
		gap: 0.4rem;
	}

	.whitelist-add-row input {
		flex: 1;
		font-size: 0.82rem;
		padding: 0.35rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		font-family: inherit;
	}

	.whitelist-add-row input:focus { border-color: var(--border-focus); }

	.btn-sm {
		padding: 0.3rem 0.7rem;
		font-size: 0.75rem;
	}

	.whitelist-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.whitelist-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		border-radius: var(--radius);
		background: var(--bg-elevated);
	}

	.wl-avatar-sm { flex-shrink: 0; }

	.wl-name { flex: 1; font-size: 0.82rem; color: var(--text-secondary); }

	.wl-remove-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.65rem;
		padding: 0.1rem 0.25rem;
		border-radius: 3px;
		transition: color var(--transition);
	}

	.wl-remove-btn:hover { color: var(--error); }

	.wl-empty { font-size: 0.75rem; color: var(--text-muted); margin: 0; }

	/* ── Unread badge ────────────────────────────────────────────────────── */
	.unread-badge {
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 999px;
		font-size: 0.6rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-left: auto;
	}

	/* ── Roles section in settings ───────────────────────────────────────── */
	.settings-roles {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.role-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		border-radius: var(--radius);
		background: var(--bg-elevated);
	}

	.role-swatch {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.role-row-name { flex: 1; font-size: 0.82rem; color: var(--text-secondary); }

	.role-create-row {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.25rem;
	}

	.color-picker {
		width: 28px;
		height: 28px;
		border: none;
		padding: 0;
		border-radius: var(--radius);
		cursor: pointer;
		background: transparent;
		flex-shrink: 0;
	}

	.role-name-input {
		flex: 1;
		font-size: 0.82rem;
		padding: 0.35rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		font-family: inherit;
	}

	.role-name-input:focus { border-color: var(--border-focus); }

	/* ── Settings icon section ───────────────────────────────────────────── */
	.settings-icon-section {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.server-icon-preview {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-lg);
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		flex-shrink: 0;
	}

	.server-icon-img { width: 100%; height: 100%; object-fit: cover; }

	.server-icon-initial { font-size: 1.5rem; font-weight: 700; color: var(--text-muted); }

	.icon-upload-label {
		font-size: 0.8rem;
		color: var(--accent);
		cursor: pointer;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		transition: background var(--transition);
	}

	.icon-upload-label:hover { background: rgba(99,102,241,0.1); }

	/* ── Load more / channel start ───────────────────────────────────────── */
	.loading-more {
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-muted);
		padding: 0.5rem;
		flex-shrink: 0;
	}

	.channel-start {
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 1rem 0 0.5rem;
		flex-shrink: 0;
	}

	/* profile menu label as button */
	label.profile-menu-item { cursor: pointer; }

	/* ── Toast ───────────────────────────────────────────────────────────── */
	.toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-elevated);
		border: 1px solid var(--border-strong);
		color: var(--text-primary);
		font-size: 0.82rem;
		padding: 0.5rem 1.25rem;
		border-radius: 999px;
		z-index: 500;
		pointer-events: none;
		animation: toast-in 0.15s ease;
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(8px); }
		to   { opacity: 1; transform: translateX(-50%) translateY(0); }
	}
</style>

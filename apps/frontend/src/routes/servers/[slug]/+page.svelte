<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import { socketStore } from '$lib/socket.js';
	import { livekitStore } from '$lib/livekit.js';
	import type { MessagePayload, VoiceMember, MessageReaction } from '$lib/types/socket-events.types.js';
	import { PERMISSION_LABELS, PERMISSION_CATEGORIES } from '$lib/permissions.js';
	import PhaserGame from '$lib/game/PhaserGame.svelte';
	import { uploadToDrive } from '$lib/driveUpload.js';

	let { data } = $props();
	const user = $derived(data.user as { id: string; username: string; role: string; avatarUrl?: string | null });
	const server = $derived(data.server as any);

	// ── Types ──────────────────────────────────────────────────────────────
	interface Channel { id: string; name: string; type: 'TEXT' | 'VOICE'; position: number; }
	interface Member {
		joinedAt: string;
		nickname?: string | null;
		user: { id: string; username: string; name?: string | null; avatarUrl?: string | null };
		role?: { id: string; name: string; color?: string | null } | null;
	}

	// ── Permissions ────────────────────────────────────────────────────────
	const isOwner = $derived(server.ownerId === user.id);
	const isSuperAdmin = $derived(user.role === 'SUPERADMIN');
	const canManage = $derived(isOwner || isSuperAdmin);

	// ── State ──────────────────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
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
	let roles = $state<{ id: string; name: string; color?: string | null; isDefault: boolean; permissions: Record<string, boolean> }[]>([]);

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

	// ── Server header dropdown ─────────────────────────────────────────────
	let showServerMenu = $state(false);
	let serverMenuBtnEl = $state<HTMLButtonElement | undefined>(undefined);
	let serverMenuTop = $state(0);
	let serverMenuLeft = $state(0);
	let serverMenuWidth = $state(0);

	function openServerMenu() {
		if (!serverMenuBtnEl) return;
		const r = serverMenuBtnEl.getBoundingClientRect();
		const menuEstH = 250;
		serverMenuLeft = r.left;
		serverMenuWidth = r.width;
		serverMenuTop = r.bottom + menuEstH > window.innerHeight ? r.top - menuEstH : r.bottom + 4;
		showServerMenu = !showServerMenu;
	}

	// ── Server settings ────────────────────────────────────────────────────
	let showSettings = $state(false);
	let settingsSection = $state<'overview' | 'roles' | 'role-edit' | 'members' | 'whitelist' | 'bans' | 'danger'>('overview');
	// svelte-ignore state_referenced_locally
	let settingsName = $state(server.name);
	// svelte-ignore state_referenced_locally
	let settingsDesc = $state(server.description ?? '');
	// svelte-ignore state_referenced_locally
	let settingsAccess = $state<'PUBLIC' | 'PASSWORD' | 'WHITELIST'>(server.accessType as any);
	let settingsPassword = $state('');
	let settingsLoading = $state(false);
	let settingsError = $state('');
	let editingRole = $state<string | null>(null);
	let editRolePerms = $state<Record<string, boolean>>({});
	let editRoleName = $state('');
	let editRoleColor = $state('');
	let editRoleLoading = $state(false);
	let bans = $state<{ userId: string; user: { id: string; username: string; name?: string | null; avatarUrl?: string | null }; reason?: string | null }[]>([]);
	let bansLoading = $state(false);

	// ── Profile card ──────────────────────────────────────────────────────
	interface ProfileCardData {
		userId: string; username: string;
		name?: string | null; avatarUrl?: string | null;
		nickname?: string | null;
		role?: { name: string; color?: string | null } | null;
	}
	let profileCard = $state<(ProfileCardData & { x: number; y: number }) | null>(null);

	function openProfileCard(data: ProfileCardData, e: MouseEvent) {
		e.stopPropagation();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const cardW = 248;
		const cardH = 230;
		const x = r.left + r.width / 2 > window.innerWidth / 2
			? r.left - cardW - 8
			: r.right + 8;
		const y = Math.min(r.top, window.innerHeight - cardH - 8);
		profileCard = { ...data, x, y };
	}

	function memberCardData(m: Member): ProfileCardData {
		return { userId: m.user.id, username: m.user.username, name: m.user.name, avatarUrl: m.user.avatarUrl, nickname: m.nickname, role: m.role };
	}

	function authorCardData(msg: MessagePayload): ProfileCardData {
		const member = members.find(m => m.user.id === msg.author.id);
		return { userId: msg.author.id, username: msg.author.username, name: msg.author.name, avatarUrl: msg.author.avatarUrl, nickname: member?.nickname, role: member?.role };
	}

	// ── Profile dropdown ───────────────────────────────────────────────────
	let showProfile = $state(false);

	// ── Icon upload ────────────────────────────────────────────────────────
	let iconUploadError = $state('');
	// svelte-ignore state_referenced_locally
	let serverIconUrl = $state<string | null>(server.iconUrl ?? null);

	// ── Connection status ─────────────────────────────────────────────────
	let socketConnected = $state(true);

	// ── Typing ────────────────────────────────────────────────────────────
	let typingUsernames = $state<string[]>([]);
	let typingTimer: ReturnType<typeof setTimeout>;
	let lastTypingEmit = 0;

	// ── Mobile sidebar ────────────────────────────────────────────────────
	let sidebarOpen = $state(false);

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
	// svelte-ignore state_referenced_locally
	let localAvatarUrl = $state(user.avatarUrl ?? null);
	$effect(() => { if ($authUser?.avatarUrl) localAvatarUrl = $authUser.avatarUrl; });
	$effect(() => { if ($livekitError) showToast($livekitError); });

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
	const activeSpeakersStore = livekitStore.activeSpeakers;
	const mutedStore = livekitStore.mutedParticipants;
	const audioLevelStore = livekitStore.audioLevel;
	const canPlayAudioStore = livekitStore.canPlayAudio;
	const micDevicesStore = livekitStore.micDevices;
	const selectedDeviceIdStore = livekitStore.selectedDeviceId;
	const screenEnabledStore = livekitStore.screenEnabled;
	const screenQualityStore = livekitStore.screenQuality;
	const screenSharesStore = livekitStore.screenShares;
	const livekitError = livekitStore.errorMessage;
	let joiningVoice = $state(false);

	function attachScreenTrack(el: HTMLVideoElement, track: any) {
		track.attach(el);
		return {
			update(newTrack: any) { track.detach(el); newTrack.attach(el); },
			destroy() { track.detach(el); },
		};
	}
	let prevTextChannel = $state<Channel | null>(null);

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
		socket.on('typing:update', ({ channelId, usernames }) => {
			if (channelId !== selectedChannel?.id) return;
			typingUsernames = usernames.filter((u) => u !== user.username);
		});
		socket.on('reaction:updated', ({ messageId, reactions }) => {
			messages = messages.map((m) => m.id === messageId ? { ...m, reactions } : m);
		});
		socket.on('disconnect', () => { socketConnected = false; });
		socket.on('connect', () => {
			socketConnected = true;
			voiceMembers = new Map();
			socket.emit('server:subscribe', {
				serverId: server.id,
				channelIds: channels.filter((c) => c.type === 'VOICE').map((c) => c.id),
			});
			if (selectedChannel) {
				socket.emit('channel:join', { channelId: selectedChannel.id });
				if (selectedChannel.type === 'TEXT') loadMessages(selectedChannel.id);
			}
			if (voiceChannelId) socket.emit('voice:join', { channelId: voiceChannelId });
		});

		socket.emit('server:subscribe', {
			serverId: server.id,
			channelIds: channels.filter((c) => c.type === 'VOICE').map((c) => c.id),
		});

		if (textChannels.length > 0) selectChannel(textChannels[0]);

		return () => {
			socket.off('message:created');
			socket.off('message:updated');
			socket.off('message:deleted');
			socket.off('voice:state');
			socket.off('voice:joined');
			socket.off('voice:left');
			socket.off('typing:update');
			socket.off('reaction:updated');
			socket.off('disconnect');
			socket.off('connect');
			clearTimeout(typingTimer);
			if (selectedChannel) socket.emit('channel:leave', { channelId: selectedChannel.id });
			if (voiceChannelId) { socket.emit('voice:leave', { channelId: voiceChannelId }); livekitStore.disconnect(); }
		};
	});

	// ── Channel selection ─────────────────────────────────────────────────
	async function selectChannel(ch: Channel) {
		const socket = socketStore.raw();
		if (!socket) return;
		if (selectedChannel && selectedChannel.id !== ch.id) socket.emit('channel:leave', { channelId: selectedChannel.id });
		if (ch.type === 'TEXT') prevTextChannel = ch;
		selectedChannel = ch;
		unread = new Map(unread).set(ch.id, 0);
		typingUsernames = [];
		sidebarOpen = false;
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
		clearTimeout(typingTimer);
		socket.emit('typing:stop', { channelId: selectedChannel.id });
		lastTypingEmit = 0;
		socket.emit('message:send', { channelId: selectedChannel.id, content });
		sendingMsg = false;
	}

	function toggleReaction(msg: MessagePayload, emoji: string) {
		const socket = socketStore.raw();
		if (!socket) return;
		socket.emit('reaction:toggle', { messageId: msg.id, emoji });
	}

	let imageUploading = $state(false);

	async function sendFile(file: File) {
		if (!selectedChannel) return;

		if (file.type.startsWith('image/')) {
			imageUploading = true;
			try {
				const fd = new FormData();
				fd.append('file', file);
				if (msgInput.trim()) fd.append('content', msgInput.trim());
				msgInput = '';
				const res = await fetch(`/api/channels/${selectedChannel.id}/messages`, {
					method: 'POST', credentials: 'include', body: fd,
				});
				if (!res.ok) showToast('Error al enviar la imagen');
			} finally {
				imageUploading = false;
			}
			return;
		}

		// Non-image → Drive direct upload (global tray tracks progress)
		const content = msgInput.trim();
		msgInput = '';
		const channelId = selectedChannel.id;
		try {
			const driveFile = await uploadToDrive(file);
			const fd = new FormData();
			if (content) fd.append('content', content);
			fd.append('attachmentUrl', driveFile.url);
			fd.append('attachmentName', file.name);
			fd.append('attachmentSize', String(file.size));
			fd.append('attachmentMimeType', file.type || 'application/octet-stream');
			const msgRes = await fetch(`/api/channels/${channelId}/messages`, {
				method: 'POST', credentials: 'include', body: fd,
			});
			if (!msgRes.ok) showToast('Error al enviar el mensaje');
		} catch {
			showToast('Error al subir el archivo');
		}
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
		const res = await fetch(`/api/channels/${selectedChannel.id}/messages/${msg.id}`, {
			method: 'DELETE', credentials: 'include',
		});
		if (!res.ok) showToast('Error al borrar el mensaje');
	}

	function onEditKeydown(e: KeyboardEvent, msg: MessagePayload) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(msg); }
		if (e.key === 'Escape') cancelEdit();
	}

	function onFileChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files?.[0]) { sendFile(files[0]); (e.target as HTMLInputElement).value = ''; }
	}

	function onTyping() {
		if (!selectedChannel) return;
		const socket = socketStore.raw();
		if (!socket) return;
		const now = Date.now();
		if (now - lastTypingEmit > 2000) {
			lastTypingEmit = now;
			socket.emit('typing:start', { channelId: selectedChannel.id });
		}
		clearTimeout(typingTimer);
		typingTimer = setTimeout(() => {
			if (selectedChannel) socket.emit('typing:stop', { channelId: selectedChannel.id });
		}, 3000);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
		onTyping();
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

	async function openDm(userId: string) {
		const res = await fetch('/api/dm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ userIds: [userId] }),
		});
		if (!res.ok) return;
		const conv = await res.json();
		goto(`/home/dm/${conv.id}`);
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
		if (joiningVoice) return;
		joiningVoice = true;
		try {
			if (voiceChannelId) await leaveVoice();
			const res = await fetch(`/api/channels/${ch.id}/livekit-token`, { credentials: 'include' });
			if (!res.ok) { showToast('No se pudo obtener acceso al canal de voz'); return; }
			const { token, url } = await res.json();
			try {
				await livekitStore.connect(url, token);
			} catch {
				showToast('Error al conectar con el canal de voz');
				return;
			}
			const socket = socketStore.raw();
			socket?.emit('voice:join', { channelId: ch.id });
			voiceChannelId = ch.id;
			selectedChannel = ch;
		} finally {
			joiningVoice = false;
		}
	}

	async function leaveVoice() {
		if (!voiceChannelId) return;
		const socket = socketStore.raw();
		socket?.emit('voice:leave', { channelId: voiceChannelId });
		livekitStore.disconnect();
		voiceChannelId = null;
		const dest = prevTextChannel ?? (textChannels.length > 0 ? textChannels[0] : null);
		if (dest) selectChannel(dest);
	}

	// ── Server settings ───────────────────────────────────────────────────
	async function openSettings(section: typeof settingsSection = 'overview') {
		settingsSection = section;
		settingsName = server.name;
		settingsDesc = server.description ?? '';
		settingsAccess = server.accessType as any;
		settingsPassword = '';
		settingsLoading = false;
		settingsError = '';
		editingRole = null;
		bans = [];

		const [membersRes, rolesRes, whitelistRes] = await Promise.all([
			fetch(`/api/servers/${server.slug}/members`, { credentials: 'include' }),
			fetch(`/api/servers/${server.slug}/roles`, { credentials: 'include' }),
			server.accessType === 'WHITELIST' ? fetch(`/api/servers/${server.slug}/whitelist`, { credentials: 'include' }) : Promise.resolve(null),
		]);
		if (membersRes.ok) members = await membersRes.json();
		if (rolesRes.ok) roles = await rolesRes.json();
		if (whitelistRes?.ok) whitelist = await whitelistRes.json();

		if (isOwner) {
			const bansRes = await fetch(`/api/servers/${server.slug}/bans`, { credentials: 'include' });
			if (bansRes.ok) bans = await bansRes.json();
		}

		showSettings = true;
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

	// ── Role editing ──────────────────────────────────────────────────────
	function startEditRole(r: { id: string; name: string; color?: string | null; permissions: Record<string, boolean> }) {
		editingRole = r.id;
		editRoleName = r.name;
		editRoleColor = r.color ?? '#6366f1';
		editRolePerms = { ...r.permissions };
	}

	async function saveRole() {
		if (!editingRole) return;
		editRoleLoading = true;
		try {
			const res = await fetch(`/api/servers/${server.slug}/roles/${editingRole}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ name: editRoleName, color: editRoleColor, permissions: editRolePerms }),
			});
			if (!res.ok) { rolesError = 'Error al guardar.'; return; }
			const updated = await res.json();
			roles = roles.map(r => r.id === editingRole ? { ...r, ...updated } : r);
			editingRole = null;
		} finally {
			editRoleLoading = false;
		}
	}

	// ── Bans ──────────────────────────────────────────────────────────────
	async function banMember(userId: string, username: string) {
		const reason = prompt(`Razón del baneo de ${username} (opcional):`);
		if (reason === null) return; // cancelled
		const res = await fetch(`/api/servers/${server.slug}/bans`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ userId, reason: reason || undefined }),
		});
		if (res.ok) {
			members = members.filter(m => m.user.id !== userId);
			showToast(`${username} baneado.`);
		}
	}

	async function unbanUser(userId: string) {
		const res = await fetch(`/api/servers/${server.slug}/bans/${userId}`, { method: 'DELETE', credentials: 'include' });
		if (res.ok) bans = bans.filter(b => b.userId !== userId);
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
		const res = await fetch(`/api/servers/${server.slug}/whitelist/${userId}`, { method: 'DELETE', credentials: 'include' });
		if (!res.ok) { showToast('Error al eliminar de la lista blanca'); return; }
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
		try {
			await authStore.updateAvatar(file);
			showProfile = false;
		} catch {
			showToast('Error al subir el avatar');
		}
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
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	const isImage = (mime: string) => mime.startsWith('image/');

	function fileIcon(mime: string): string {
		if (mime.startsWith('video/')) return '🎬';
		if (mime.startsWith('audio/')) return '🎵';
		if (mime === 'application/pdf') return '📄';
		if (mime.includes('word') || mime.includes('document')) return '📝';
		if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) return '📊';
		if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('gzip') || mime.includes('7z')) return '📦';
		if (mime.startsWith('text/')) return '📋';
		return '📎';
	}

	function canEditMsg(msg: MessagePayload) { return msg.author.id === user.id; }
	function canDeleteMsg(msg: MessagePayload) { return msg.author.id === user.id || canManage; }
</script>

<svelte:head><title>{totalUnread > 0 ? `(${totalUnread}) ` : ''}{server.name} — Meado</title></svelte:head>

{#if server.serverType === 'SPATIAL'}
	<div class="spatial-shell">
		<PhaserGame roomSlug={server.slug} username={user.username} />
	</div>
{:else}
<div class="discord-layout" class:show-members={showMembers} class:sidebar-open={sidebarOpen}>
	{#if !socketConnected}
		<div class="reconnect-banner">Conexión perdida — reconectando…</div>
	{/if}

	{#if sidebarOpen}
		<div class="sidebar-overlay" role="presentation" onclick={() => (sidebarOpen = false)}></div>
	{/if}
	<!-- ── Sidebar ───────────────────────────────────────────────────────── -->
	<aside class="sidebar">
		<!-- Server name dropdown trigger -->
		<div class="server-header" class:menu-open={showServerMenu}>
			<button
				bind:this={serverMenuBtnEl}
				class="server-name-btn"
				onclick={openServerMenu}
				aria-haspopup="true"
				aria-expanded={showServerMenu}
			>
				<span class="server-name-text">{server.name}</span>
				<span class="server-name-chevron">{showServerMenu ? '✕' : '⌄'}</span>
			</button>
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
					<!-- svelte-ignore a11y_autofocus -->
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
					<!-- svelte-ignore a11y_autofocus -->
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
					<button class="channel-btn" onclick={() => selectChannel(ch)}>
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
							<div class="voice-participant-item" class:vp-speaking={$activeSpeakersStore.includes(m.userId)}>
								{#if m.avatarUrl}
									<img src={m.avatarUrl} class="avatar-xs" alt="" />
								{:else}
									<div class="avatar-xs avatar-init">{avatarInitial(m.username)}</div>
								{/if}
								<span class="vp-name">{m.username}</span>
								{#if m.userId !== user.id && $mutedStore.has(m.userId)}
									<span class="vp-muted">🔇</span>
								{/if}
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

	<!-- Server name dropdown (fixed-positioned to escape sidebar overflow) -->
	{#if showServerMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="server-menu-overlay" onclick={() => (showServerMenu = false)} onkeydown={() => {}}></div>
		<div class="server-menu" style="top:{serverMenuTop}px; left:{serverMenuLeft}px; width:{serverMenuWidth}px;">
			<button class="smenu-item" onclick={() => { copyInviteLink(); showServerMenu = false; }}>
				<span class="smenu-label">Copiar enlace de invitación</span>
				<span class="smenu-icon">🔗</span>
			</button>

			{#if canManage}
				<div class="smenu-sep"></div>
				<button class="smenu-item" onclick={() => { showServerMenu = false; openSettings('overview'); }}>
					<span class="smenu-label">Ajustes del servidor</span>
					<span class="smenu-icon">⚙️</span>
				</button>
				<button class="smenu-item" onclick={() => { showServerMenu = false; openSettings('roles'); }}>
					<span class="smenu-label">Gestionar roles</span>
					<span class="smenu-icon">🎭</span>
				</button>
				<button class="smenu-item" onclick={() => { showServerMenu = false; openSettings('members'); }}>
					<span class="smenu-label">Gestionar miembros</span>
					<span class="smenu-icon">👥</span>
				</button>
			{/if}

			<div class="smenu-sep"></div>

			{#if !isOwner}
				<button class="smenu-item smenu-danger" onclick={() => { showServerMenu = false; leaveServer(); }}>
					<span class="smenu-label">Abandonar servidor</span>
					<span class="smenu-icon">🚪</span>
				</button>
			{/if}
		</div>
	{/if}

	<!-- ── Main content ───────────────────────────────────────────────────── -->
	<main class="main-content">
		{#if !selectedChannel}
			<div class="empty-state">Selecciona un canal</div>

		{:else if selectedChannel.type === 'TEXT'}
			<div class="content-header">
				<button class="hamburger-btn" onclick={() => (sidebarOpen = true)} title="Canales">☰</button>
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
									<button class="avatar-btn-msg" onclick={(e) => openProfileCard(authorCardData(msg), e)}>
										{#if msg.author.avatarUrl}
											<img src={msg.author.avatarUrl} class="avatar-msg" alt="" />
										{:else}
											<div class="avatar-msg avatar-init">{avatarInitial(msg.author.name || msg.author.username)}</div>
										{/if}
									</button>
								</div>
								<div class="msg-body">
									<div class="msg-header">
										<button class="msg-author-btn" onclick={(e) => openProfileCard(authorCardData(msg), e)}>{msg.author.name || msg.author.username}</button>
										<span class="msg-time">{formatTime(msg.createdAt)}</span>
										{#if msg.editedAt}<span class="msg-edited">(editado)</span>{/if}
									</div>
									{#if editingId === msg.id}
										<div class="edit-box">
											<!-- svelte-ignore a11y_autofocus -->
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
												<a href={att.url} target="_blank" rel="noreferrer" class="att-img-wrap">
													<img src={att.url} class="att-img" alt={att.name} loading="lazy" />
												</a>
											{:else}
												<div class="att-file">
													<span class="att-icon">{fileIcon(att.mimeType)}</span>
													<div class="att-info">
														<a href={att.url} target="_blank" rel="noreferrer" class="att-name">{att.name}</a>
														<span class="att-size">{fileSize(att.size)}</span>
													</div>
													<a href={att.url} download={att.name} rel="noreferrer" class="att-dl" aria-label="Descargar">↓</a>
												</div>
											{/if}
										</div>
									{/each}
									{#if msg.reactions?.length > 0}
										<div class="reactions">
											{#each msg.reactions as r (r.emoji)}
												<button class="reaction-pill" class:reacted={r.me} onclick={() => toggleReaction(msg, r.emoji)}>{r.emoji} {r.count}</button>
											{/each}
										</div>
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
											<!-- svelte-ignore a11y_autofocus -->
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
												<a href={att.url} target="_blank" rel="noreferrer" class="att-img-wrap">
													<img src={att.url} class="att-img" alt={att.name} loading="lazy" />
												</a>
											{:else}
												<div class="att-file">
													<span class="att-icon">{fileIcon(att.mimeType)}</span>
													<div class="att-info">
														<a href={att.url} target="_blank" rel="noreferrer" class="att-name">{att.name}</a>
														<span class="att-size">{fileSize(att.size)}</span>
													</div>
													<a href={att.url} download={att.name} rel="noreferrer" class="att-dl" aria-label="Descargar">↓</a>
												</div>
											{/if}
										</div>
									{/each}
									{#if msg.reactions?.length > 0}
										<div class="reactions">
											{#each msg.reactions as r (r.emoji)}
												<button class="reaction-pill" class:reacted={r.me} onclick={() => toggleReaction(msg, r.emoji)}>{r.emoji} {r.count}</button>
											{/each}
										</div>
									{/if}
								</div>
							{/if}

							<!-- Hover actions -->
							{#if hoveredId === msg.id && editingId !== msg.id}
								<div class="msg-actions">
									<div class="emoji-picker">
										{#each ['👍','❤️','😂','😮','😢'] as emoji}
											<button class="emoji-pick-btn" onclick={() => toggleReaction(msg, emoji)}>{emoji}</button>
										{/each}
									</div>
									{#if canEditMsg(msg)}<button class="msg-action-btn" title="Editar" onclick={() => startEdit(msg)}>✏️</button>{/if}
									{#if canDeleteMsg(msg)}<button class="msg-action-btn danger" title="Eliminar" onclick={() => deleteMsg(msg)}>🗑️</button>{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if typingUsernames.length > 0}
				<div class="typing-indicator">
					<span class="typing-dots"><span></span><span></span><span></span></span>
					<span class="typing-text">
						{#if typingUsernames.length === 1}
							<strong>{typingUsernames[0]}</strong> está escribiendo…
						{:else if typingUsernames.length === 2}
							<strong>{typingUsernames[0]}</strong> y <strong>{typingUsernames[1]}</strong> están escribiendo…
						{:else}
							Varios usuarios están escribiendo…
						{/if}
					</span>
				</div>
			{/if}
			<div class="input-area">
				<div class="input-box">
					<button class="attach-btn" title="Adjuntar archivo" disabled={imageUploading} onclick={() => fileInput?.click()}>+</button>
					<input class="hidden-file" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" bind:this={fileInput} onchange={onFileChange} />
					<textarea class="msg-input" placeholder="Escribir en #{selectedChannel.name}" bind:value={msgInput} onkeydown={onKeydown} rows="1" maxlength="4000"></textarea>
					<button class="send-btn" disabled={!msgInput.trim() || sendingMsg} onclick={() => sendMessage()}>↑</button>
				</div>
			</div>

		{:else if selectedChannel.type === 'VOICE'}
			<div class="content-header">
				<button class="hamburger-btn" onclick={() => (sidebarOpen = true)} title="Canales">☰</button>
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
						<button
							class="btn-primary"
							disabled={joiningVoice}
							onclick={() => selectedChannel && joinVoiceChannel(selectedChannel)}
						>
							{joiningVoice ? 'Conectando...' : 'Unirse al canal de voz'}
						</button>
					</div>
				{:else}
					<div class="voice-participants-grid">
						{#each currentVoiceMembers as m (m.userId)}
							{@const isSpeaking = $activeSpeakersStore.includes(m.userId)}
							{@const isMuted = m.userId !== user.id && $mutedStore.has(m.userId)}
							<div class="voice-card" class:is-you={m.userId === user.id} class:speaking={isSpeaking}>
								<div class="voice-avatar-wrap">
									{#if m.avatarUrl}
										<img src={m.avatarUrl} class="voice-avatar" alt="" />
									{:else}
										<div class="voice-avatar avatar-init">{avatarInitial(m.username)}</div>
									{/if}
									{#if isSpeaking}
										<span class="speaking-ring"></span>
									{/if}
									{#if isMuted}
										<span class="muted-badge">🔇</span>
									{/if}
								</div>
								<span class="voice-card-name">{m.username}{m.userId === user.id ? ' (tú)' : ''}</span>
							</div>
						{/each}
					</div>
					{#if $screenSharesStore.size > 0}
						<div class="screen-shares-section">
							<div class="screen-shares-label">Pantallas compartidas</div>
							<div class="screen-shares-grid">
								{#each [...$screenSharesStore.entries()] as [identity, share] (identity)}
									<div class="screen-card">
										<!-- svelte-ignore a11y_media_has_caption -->
										<video use:attachScreenTrack={share.track} class="screen-video" autoplay playsinline muted></video>
										<div class="screen-card-name">{share.username}</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					{#if !$canPlayAudioStore}
						<button class="audio-unlock-banner" onclick={() => livekitStore.startAudio()}>
							🔇 Audio bloqueado por el navegador — haz clic aquí para activarlo
						</button>
					{/if}
					<div class="voice-controls-bar">
						<div class="mic-control">
							<button class="ctrl-btn-lg" class:active={$micEnabledStore} onclick={() => livekitStore.toggleMic()}>
								{$micEnabledStore ? '🎙️ Micro activo' : '🔇 Micro silenciado'}
							</button>
							{#if $micEnabledStore}
								<div class="mic-level-bar" title="Nivel de micrófono">
									<div class="mic-level-fill" style="width: {Math.round($audioLevelStore * 100)}%"></div>
								</div>
							{/if}
							{#if $micDevicesStore.length > 1}
								<select
									class="device-select"
									value={$selectedDeviceIdStore}
									onchange={(e) => livekitStore.selectDevice(e.currentTarget.value)}
								>
									{#each $micDevicesStore as d (d.deviceId)}
										<option value={d.deviceId}>{d.label}</option>
									{/each}
								</select>
							{/if}
						</div>
						<div class="screen-control">
							<select
								class="device-select"
								value={$screenQualityStore}
								onchange={(e) => screenQualityStore.set(e.currentTarget.value as any)}
								disabled={$screenEnabledStore}
							>
								<option value="low">720p · 15fps</option>
								<option value="medium">1080p · 30fps</option>
								<option value="high">1080p · 60fps</option>
							</select>
							<button class="ctrl-btn-lg" class:active={$screenEnabledStore} onclick={() => livekitStore.toggleScreen()}>
								{$screenEnabledStore ? '🖥️ Detener' : '🖥️ Compartir pantalla'}
							</button>
						</div>
						<button class="ctrl-btn-lg danger" onclick={leaveVoice}>📵 Desconectar</button>
					</div>
				{/if}
			</div>
		{/if}
	</main>

	<!-- Settings full-screen -->
	{#if showSettings}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="settings-fullscreen" role="dialog" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showSettings = false; }}>
			<!-- Left nav -->
			<aside class="settings-nav">
				<div class="settings-nav-server">{server.name}</div>

				<div class="settings-nav-group">
					<div class="settings-nav-category">GESTIÓN</div>
					<button class="settings-nav-item" class:active={settingsSection === 'overview'} onclick={() => settingsSection = 'overview'}>Visión general</button>
					<button class="settings-nav-item" class:active={settingsSection === 'roles' || settingsSection === 'role-edit'} onclick={() => { settingsSection = 'roles'; editingRole = null; }}>Roles</button>
					<button class="settings-nav-item" class:active={settingsSection === 'members'} onclick={() => settingsSection = 'members'}>Miembros</button>
					{#if settingsAccess === 'WHITELIST'}
						<button class="settings-nav-item" class:active={settingsSection === 'whitelist'} onclick={() => settingsSection = 'whitelist'}>Lista blanca</button>
					{/if}
					{#if isOwner}
						<button class="settings-nav-item" class:active={settingsSection === 'bans'} onclick={() => settingsSection = 'bans'}>Baneados</button>
					{/if}
				</div>

				<div class="settings-nav-group">
					<div class="settings-nav-category">ZONA DE PELIGRO</div>
					{#if !isOwner}
						<button class="settings-nav-item settings-nav-danger" onclick={leaveServer}>Abandonar servidor</button>
					{/if}
					{#if isOwner}
						<button class="settings-nav-item settings-nav-danger" onclick={deleteServer}>Eliminar servidor</button>
					{/if}
				</div>
			</aside>

			<!-- Content -->
			<div class="settings-content">
				<div class="settings-content-inner">

					<!-- OVERVIEW -->
					{#if settingsSection === 'overview'}
						<h2 class="sc-title">Visión general</h2>
						<div class="sc-icon-row">
							<div class="server-icon-preview">
								{#if serverIconUrl}
									<img src={serverIconUrl} alt="" class="server-icon-img" />
								{:else}
									<span class="server-icon-initial">{server.name[0].toUpperCase()}</span>
								{/if}
							</div>
							<div class="sc-icon-actions">
								<label class="icon-upload-label">
									<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden-file" onchange={uploadIcon} />
									Cambiar icono
								</label>
								{#if iconUploadError}<p class="error">{iconUploadError}</p>{/if}
							</div>
						</div>
						<form class="sc-form" onsubmit={saveSettings}>
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
									<option value="PUBLIC">Público</option>
									<option value="PASSWORD">Contraseña</option>
									<option value="WHITELIST">Lista blanca</option>
								</select>
							</label>
							{#if settingsAccess === 'PASSWORD'}
								<label>
									Nueva contraseña <span class="optional">(vacío = sin cambio)</span>
									<input type="password" bind:value={settingsPassword} placeholder="Nueva contraseña" />
								</label>
							{/if}
							{#if settingsError}<p class="error">{settingsError}</p>{/if}
							<div class="sc-form-footer">
								<button type="submit" class="btn-primary" disabled={settingsLoading}>
									{settingsLoading ? 'Guardando...' : 'Guardar cambios'}
								</button>
							</div>
						</form>

					<!-- ROLES -->
					{:else if settingsSection === 'roles'}
						<h2 class="sc-title">Roles</h2>
						{#each roles.filter(r => !r.isDefault) as r (r.id)}
							<div class="role-row-v2">
								<span class="role-swatch" style="background: {r.color ?? '#6b7280'}"></span>
								<span class="role-row-name">{r.name}</span>
								<button class="icon-btn-sm" onclick={() => { startEditRole(r); settingsSection = 'role-edit'; }}>Editar</button>
								<button class="icon-btn-sm danger" onclick={() => deleteRole(r.id)}>Eliminar</button>
							</div>
						{/each}
						<div class="sc-sep"></div>
						<h4 class="sc-subtitle">Crear nuevo rol</h4>
						<div class="role-create-row">
							<input type="color" bind:value={newRoleColor} class="color-picker" title="Color del rol" />
							<input type="text" placeholder="Nombre del rol" bind:value={newRoleName} class="role-name-input"
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createRole(); } }} />
							<button type="button" class="btn-primary btn-sm" onclick={createRole} disabled={createRoleLoading}>
								{createRoleLoading ? '...' : 'Crear'}
							</button>
						</div>
						{#if rolesError}<p class="error">{rolesError}</p>{/if}

					<!-- ROLE EDIT -->
					{:else if settingsSection === 'role-edit'}
						<div class="sc-back-row">
							<button class="back-btn" onclick={() => { settingsSection = 'roles'; editingRole = null; }}>← Roles</button>
						</div>
						<h2 class="sc-title">Editar rol</h2>
						<div class="role-editor-basic">
							<input type="color" bind:value={editRoleColor} class="color-picker" title="Color" />
							<input type="text" bind:value={editRoleName} placeholder="Nombre del rol" class="role-name-input" />
						</div>
						<div class="perm-categories">
							{#each PERMISSION_CATEGORIES as cat}
								<div class="perm-cat">
									<span class="perm-cat-label">{cat.label}</span>
									{#each cat.keys as key}
										<label class="perm-row">
											<input type="checkbox" bind:checked={editRolePerms[key]} />
											<span>{PERMISSION_LABELS[key]}</span>
										</label>
									{/each}
								</div>
							{/each}
						</div>
						{#if rolesError}<p class="error">{rolesError}</p>{/if}
						<div class="sc-form-footer">
							<button class="btn-primary" onclick={saveRole} disabled={editRoleLoading}>
								{editRoleLoading ? 'Guardando...' : 'Guardar rol'}
							</button>
							<button class="btn-ghost" onclick={() => { settingsSection = 'roles'; editingRole = null; }}>Cancelar</button>
						</div>

					<!-- MEMBERS -->
					{:else if settingsSection === 'members'}
						<h2 class="sc-title">Miembros ({members.length})</h2>
						{#each members as m (m.user.id)}
							<div class="member-settings-row">
								<div class="ms-avatar">
									{#if m.user.avatarUrl}
										<img src={m.user.avatarUrl} class="avatar-sm" alt="" />
									{:else}
										<div class="avatar-sm avatar-init">{avatarInitial(m.user.username)}</div>
									{/if}
								</div>
								<div class="ms-info">
									<span class="ms-name">{m.nickname ?? m.user.name ?? m.user.username}</span>
									<span class="ms-tag">@{m.user.username}</span>
								</div>
								{#if server.ownerId === m.user.id}
									<span class="owner-badge">Propietario</span>
								{:else}
									<select class="role-select-sm" value={m.role?.id ?? ''} onchange={(e) => assignRole(m.user.id, (e.target as HTMLSelectElement).value || null)}>
										<option value="">Sin rol</option>
										{#each roles.filter(r => !r.isDefault) as r (r.id)}
											<option value={r.id}>{r.name}</option>
										{/each}
									</select>
								{/if}
								{#if m.user.id !== user.id && server.ownerId !== m.user.id}
									<div class="ms-actions">
										<button class="icon-btn-sm" onclick={() => kickMember(m.user.id, m.user.username)}>Expulsar</button>
										{#if isOwner || canManage}
											<button class="icon-btn-sm danger" onclick={() => banMember(m.user.id, m.user.username)}>Banear</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}

					<!-- WHITELIST -->
					{:else if settingsSection === 'whitelist'}
						<h2 class="sc-title">Lista blanca</h2>
						<div class="whitelist-add-row">
							<input type="text" placeholder="Nombre de usuario" bind:value={whitelistInput}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToWhitelist(); } }} />
							<button type="button" class="btn-primary btn-sm" onclick={addToWhitelist} disabled={whitelistLoading}>
								{whitelistLoading ? '...' : 'Añadir'}
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
										<button type="button" class="wl-remove-btn" onclick={() => removeFromWhitelist(entry.user.id)}>Quitar</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="wl-empty">Ningún usuario en lista blanca.</p>
						{/if}

					<!-- BANS -->
					{:else if settingsSection === 'bans'}
						<h2 class="sc-title">Baneados ({bans.length})</h2>
						{#if bans.length === 0}
							<p class="wl-empty">Nadie baneado.</p>
						{:else}
							{#each bans as ban (ban.userId)}
								<div class="member-settings-row">
									<div class="ms-avatar">
										{#if ban.user.avatarUrl}
											<img src={ban.user.avatarUrl} class="avatar-sm" alt="" />
										{:else}
											<div class="avatar-sm avatar-init">{avatarInitial(ban.user.username)}</div>
										{/if}
									</div>
									<div class="ms-info">
										<span class="ms-name">{ban.user.name ?? ban.user.username}</span>
										<span class="ms-tag">@{ban.user.username}</span>
										{#if ban.reason}<span class="ban-reason">"{ban.reason}"</span>{/if}
									</div>
									<button class="btn-ghost btn-sm" onclick={() => unbanUser(ban.userId)}>Desbanear</button>
								</div>
							{/each}
						{/if}
					{/if}

				</div>
			</div>

			<!-- Close button -->
			<button class="settings-close-btn" onclick={() => showSettings = false} title="Cerrar (Esc)">
				<span>✕</span>
				<span class="settings-close-label">ESC</span>
			</button>
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
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<li class="member-item" onclick={(e) => openProfileCard(memberCardData(m), e)} onkeydown={() => {}}>
							{#if m.user.avatarUrl}
								<img src={m.user.avatarUrl} class="avatar-sm" alt="" />
							{:else}
								<div class="avatar-sm avatar-init">{avatarInitial(m.user.username)}</div>
							{/if}
							<div class="member-info">
								<span class="member-name">{m.nickname ?? m.user.name ?? m.user.username}</span>
								{#if canManage && roles.length > 0 && m.user.id !== user.id}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<select
										class="role-select"
										value={m.role?.id ?? ''}
										onclick={(e) => e.stopPropagation()}
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
							{#if m.user.id !== user.id}
								<button class="dm-btn" title="Mensaje directo" onclick={(e) => { e.stopPropagation(); openDm(m.user.id); }}>💬</button>
							{/if}
							{#if canManage && m.user.id !== user.id}
								<button class="kick-btn" title="Expulsar" onclick={(e) => { e.stopPropagation(); kickMember(m.user.id, m.user.username); }}>✕</button>
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

	<!-- ── Profile card ───────────────────────────────────────────────────── -->
	{#if profileCard}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pc-overlay" onclick={() => (profileCard = null)} onkeydown={() => {}}></div>
		<div class="profile-card" style="top:{profileCard.y}px; left:{profileCard.x}px;">
			<div class="pc-avatar-wrap">
				{#if profileCard.avatarUrl}
					<img src={profileCard.avatarUrl} class="pc-avatar-img" alt="" />
				{:else}
					<div class="pc-avatar-init">{avatarInitial(profileCard.username)}</div>
				{/if}
			</div>
			<div class="pc-body">
				<div class="pc-displayname">
					{profileCard.nickname ?? profileCard.name ?? profileCard.username}
				</div>
				{#if profileCard.nickname || profileCard.name}
					<div class="pc-tag">@{profileCard.username}</div>
				{/if}
				{#if profileCard.role}
					<div class="pc-role" style="color:{profileCard.role.color ?? 'var(--text-muted)'}">
						{profileCard.role.name}
					</div>
				{/if}
			</div>
			{#if profileCard.userId !== user.id}
				<div class="pc-actions">
					<button class="pc-dm-btn" onclick={() => { const uid = profileCard!.userId; profileCard = null; openDm(uid); }}>
						💬 Enviar mensaje
					</button>
					{#if canManage}
						<button class="pc-kick-btn" onclick={() => { const u = profileCard!; profileCard = null; kickMember(u.userId, u.username); }}>
							Expulsar
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
{/if}

<style>
	.spatial-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: var(--bg-base);
	}

	/* ── Layout ──────────────────────────────────────────────────────────── */
	.discord-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		height: 100%;
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
		position: relative;
		height: 48px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
	}

	.server-name-btn {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.75rem 0 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background var(--transition);
		font-family: inherit;
	}
	.server-name-btn:hover { background: rgba(255,255,255,0.05); }
	.server-header.menu-open .server-name-btn { background: rgba(255,255,255,0.07); }

	.server-name-chevron { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }

	/* Server dropdown menu */
	.server-menu-overlay {
		position: fixed; inset: 0; z-index: 90;
	}
	.server-menu {
		position: fixed;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0,0,0,0.5);
		z-index: 100;
		padding: 0.3rem;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.smenu-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.82rem;
		font-family: inherit;
		text-align: left;
		transition: background var(--transition), color var(--transition);
	}
	.smenu-item:hover { background: var(--accent); color: var(--accent-text); }
	.smenu-item:hover .smenu-icon { filter: none; }
	.smenu-danger { color: var(--error); }
	.smenu-danger:hover { background: var(--error-surface); color: var(--error); }
	.smenu-label { font-weight: 500; }
	.smenu-icon { font-size: 0.8rem; opacity: 0.7; }
	.smenu-sep { height: 1px; background: var(--border); margin: 0.2rem 0; }

	/* Full-screen settings */
	.settings-fullscreen {
		position: fixed;
		inset: 0;
		z-index: 400;
		background: var(--bg-base);
		display: flex;
	}
	.settings-nav {
		width: 220px;
		flex-shrink: 0;
		background: var(--bg-elevated);
		padding: 1.5rem 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
	}
	.settings-nav-server {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-secondary);
		padding: 0 0.6rem;
		margin-bottom: 0.25rem;
	}
	.settings-nav-group { display: flex; flex-direction: column; gap: 0.05rem; }
	.settings-nav-category {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		padding: 0.6rem 0.6rem 0.25rem;
	}
	.settings-nav-item {
		width: 100%;
		padding: 0.45rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.82rem;
		font-family: inherit;
		text-align: left;
		transition: background var(--transition), color var(--transition);
	}
	.settings-nav-item:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
	.settings-nav-item.active { background: rgba(255,255,255,0.1); color: var(--text-primary); font-weight: 600; }
	.settings-nav-danger { color: var(--error) !important; }
	.settings-nav-danger:hover { background: var(--error-surface) !important; }

	.settings-content {
		flex: 1;
		overflow-y: auto;
		padding: 2rem 2.5rem;
		max-width: 720px;
	}
	.settings-content-inner { display: flex; flex-direction: column; gap: 1.25rem; }
	.sc-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.5rem; }
	.sc-subtitle { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin: 0; }
	.sc-sep { height: 1px; background: var(--border); }
	.sc-back-row { margin-bottom: -0.25rem; }
	.sc-form { display: flex; flex-direction: column; gap: 0.85rem; }
	.sc-form label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; color: var(--text-secondary); }
	.sc-form input, .sc-form select { font-size: 0.85rem; padding: 0.5rem 0.65rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-primary); outline: none; transition: border-color var(--transition); }
	.sc-form input:focus, .sc-form select:focus { border-color: var(--border-focus); }
	.sc-form-footer { display: flex; gap: 0.5rem; padding-top: 0.25rem; }
	.sc-icon-row { display: flex; align-items: center; gap: 1rem; }
	.sc-icon-actions { display: flex; flex-direction: column; gap: 0.4rem; }

	.settings-close-btn {
		position: fixed;
		top: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.4rem 0.6rem;
		font-size: 0.9rem;
		transition: background var(--transition), color var(--transition);
		z-index: 401;
	}
	.settings-close-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.settings-close-label { font-size: 0.55rem; letter-spacing: 0.05em; color: var(--text-muted); }

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
		background: var(--success);
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

	.vp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

	.voice-participant-item.vp-speaking .vp-name { color: var(--accent); }

	.vp-muted { font-size: 0.65rem; opacity: 0.6; flex-shrink: 0; }

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
		background: var(--accent-dim);
		border-radius: var(--radius);
		border: 1px solid rgba(59,130,246,0.25);
	}

	.voice-status-label { font-size: 0.72rem; color: var(--accent); }
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

	.avatar-btn-msg {
		background: transparent; border: none; padding: 0; cursor: pointer;
		border-radius: 50%; display: block;
	}
	.avatar-btn-msg:hover { opacity: 0.8; }

	.msg-author-btn {
		background: transparent; border: none; padding: 0; cursor: pointer;
		font-size: 0.875rem; font-weight: 600; color: var(--text-primary);
		font-family: inherit;
	}
	.msg-author-btn:hover { text-decoration: underline; }

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

	.emoji-picker {
		display: flex;
		gap: 0.1rem;
		align-items: center;
	}

	.emoji-pick-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.15rem 0.2rem;
		border-radius: var(--radius);
		line-height: 1;
		transition: background var(--transition);
	}
	.emoji-pick-btn:hover { background: var(--bg-surface); }

	.reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.2rem;
	}

	.reaction-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 1rem;
		padding: 0.1rem 0.45rem;
		font-size: 0.8rem;
		cursor: pointer;
		transition: background var(--transition), border-color var(--transition);
		line-height: 1.4;
	}
	.reaction-pill:hover { background: var(--bg-surface); border-color: var(--border-strong); }
	.reaction-pill.reacted { background: rgba(99,102,241,0.15); border-color: var(--accent); }

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
	.attachment { margin-top: 0.3rem; }

	.att-img-wrap { display: inline-block; }

	.att-img {
		max-width: 400px;
		max-height: 300px;
		border-radius: var(--radius);
		display: block;
		cursor: zoom-in;
	}

	.att-file {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		max-width: 320px;
	}

	.att-icon { font-size: 1.2rem; flex-shrink: 0; }

	.att-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		overflow: hidden;
	}

	.att-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.att-name:hover { text-decoration: underline; }

	.att-size { color: var(--text-muted); font-size: 0.68rem; }

	.att-dl {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-decoration: none;
		transition: background var(--transition), color var(--transition);
	}

	.att-dl:hover { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }

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
		justify-content: flex-start;
		overflow-y: auto;
		gap: 1.5rem;
		padding: 2rem;
	}

	.voice-join-prompt {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
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

	.voice-card.speaking { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }

	.voice-avatar-wrap {
		position: relative;
		width: 64px; height: 64px;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}

	.speaking-ring {
		position: absolute; inset: -4px;
		border-radius: 50%;
		border: 2px solid var(--accent);
		animation: speaking-pulse 1s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes speaking-pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(1.08); }
	}

	.muted-badge {
		position: absolute;
		bottom: -2px; right: -2px;
		font-size: 0.7rem;
		line-height: 1;
		background: var(--bg-secondary);
		border-radius: 50%;
		padding: 1px;
	}

	.device-select {
		font-size: 0.72rem;
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.15rem 0.35rem;
		cursor: pointer;
		width: 100%;
	}
	.device-select:focus { outline: none; border-color: var(--accent); }

	.screen-control { display: flex; flex-direction: column; gap: 0.3rem; align-items: stretch; }

	/* Screen share viewer */
	.screen-shares-section {
		width: 100%;
		max-width: 800px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.screen-shares-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.screen-shares-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.screen-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		flex: 1;
		min-width: 280px;
		max-width: 560px;
	}

	.screen-video {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: contain;
		background: #000;
		display: block;
	}

	.screen-card-name {
		font-size: 0.78rem;
		color: var(--text-muted);
		padding: 0.25rem 0.5rem 0.35rem;
	}

	.voice-avatar {
		width: 64px; height: 64px;
		border-radius: 50%;
		object-fit: cover;
		display: flex; align-items: center; justify-content: center;
	}

	.voice-card-name { font-size: 0.82rem; color: var(--text-secondary); }

	.audio-unlock-banner {
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #fca5a5;
		border-radius: var(--radius);
		padding: 0.5rem 1rem;
		font-size: 0.82rem;
		cursor: pointer;
		width: 100%; max-width: 480px;
		text-align: center;
	}
	.audio-unlock-banner:hover { background: rgba(239, 68, 68, 0.2); }

	.voice-controls-bar { display: flex; gap: 0.75rem; align-items: center; }

	.mic-control { display: flex; flex-direction: column; align-items: stretch; gap: 0.3rem; }

	.mic-level-bar {
		height: 3px;
		background: rgba(255,255,255,0.1);
		border-radius: 2px;
		overflow: hidden;
		width: 100%;
	}
	.mic-level-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
		transition: width 0.05s linear;
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
	.member-item:hover .dm-btn { opacity: 1; }

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

	.dm-btn {
		opacity: 0;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		transition: color var(--transition), opacity var(--transition);
		flex-shrink: 0;
	}
	.dm-btn:hover { color: var(--accent); }

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

	.optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text-muted); }

	.error { font-size: 0.75rem; color: var(--error); }

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

	.role-row-v2 { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.5rem; border-radius: var(--radius); background: var(--bg-elevated); }
	.role-row-v2 .role-row-name { flex: 1; font-size: 0.82rem; }
	.icon-btn-sm { background: transparent; border: none; cursor: pointer; font-size: 0.8rem; padding: 0.15rem 0.35rem; border-radius: var(--radius-sm); color: var(--text-muted); transition: color var(--transition), background var(--transition); }
	.icon-btn-sm:hover { color: var(--text-primary); background: var(--bg-surface); }
	.icon-btn-sm.danger:hover { color: var(--error); }
	.back-btn { background: transparent; border: none; color: var(--accent); cursor: pointer; font-size: 0.78rem; padding: 0; font-family: inherit; }
	.role-editor-basic { display: flex; align-items: center; gap: 0.5rem; }
	.perm-categories { display: flex; flex-direction: column; gap: 1rem; }
	.perm-cat { display: flex; flex-direction: column; gap: 0.25rem; }
	.perm-cat-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 0.1rem; }
	.perm-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; padding: 0.2rem 0; }
	.perm-row input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; }
	.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius); padding: 0.45rem 0.85rem; cursor: pointer; font-size: 0.8rem; font-family: inherit; }
	.btn-ghost:hover { background: var(--bg-elevated); }
	.member-settings-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.5rem; border-radius: var(--radius); background: var(--bg-elevated); }
	.ms-avatar { flex-shrink: 0; }
	.ms-info { flex: 1; display: flex; flex-direction: column; gap: 0.02rem; min-width: 0; }
	.ms-name { font-size: 0.82rem; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ms-tag { font-size: 0.65rem; color: var(--text-muted); }
	.ms-actions { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
	.owner-badge { font-size: 0.62rem; padding: 0.1rem 0.4rem; border: 1px solid #f59e0b; color: #f59e0b; border-radius: 2px; flex-shrink: 0; }
	.role-select-sm { font-size: 0.72rem; padding: 0.15rem 0.35rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); max-width: 110px; font-family: inherit; }
	.ban-reason { font-size: 0.65rem; color: var(--text-muted); font-style: italic; }

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

	/* ── Reconnect banner ────────────────────────────────────────────────── */
	.reconnect-banner {
		position: fixed;
		top: 0; left: 0; right: 0;
		background: #b45309;
		color: #fef3c7;
		text-align: center;
		font-size: 0.78rem;
		padding: 0.4rem;
		z-index: 1000;
		font-weight: 600;
	}

	/* ── Typing indicator ────────────────────────────────────────────────── */
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 1.25rem 0;
		min-height: 20px;
		flex-shrink: 0;
	}

	.typing-text { font-size: 0.72rem; color: var(--text-muted); }
	.typing-text strong { color: var(--text-secondary); font-weight: 600; }

	.typing-dots {
		display: flex;
		gap: 2px;
		align-items: flex-end;
	}

	.typing-dots span {
		width: 4px; height: 4px;
		border-radius: 50%;
		background: var(--text-muted);
		animation: bounce 1.2s infinite;
	}

	.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
	.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes bounce {
		0%, 60%, 100% { transform: translateY(0); }
		30% { transform: translateY(-4px); }
	}

	/* ── Hamburger (mobile only) ─────────────────────────────────────────── */
	.hamburger-btn {
		display: none;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius);
		transition: color var(--transition);
		flex-shrink: 0;
	}

	.hamburger-btn:hover { color: var(--text-primary); }

	.sidebar-overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.5);
		z-index: 98;
	}

	/* ── Mobile responsive ───────────────────────────────────────────────── */
	@media (max-width: 768px) {
		.discord-layout {
			grid-template-columns: 1fr !important;
		}

		.sidebar {
			position: fixed;
			top: 0; left: 0; bottom: 0;
			width: 260px;
			z-index: 99;
			transform: translateX(-100%);
			transition: transform 0.22s ease;
		}

		.discord-layout.sidebar-open .sidebar {
			transform: translateX(0);
		}

		.discord-layout.sidebar-open .sidebar-overlay {
			display: block;
		}

		.members-panel {
			position: fixed;
			top: 0; right: 0; bottom: 0;
			width: 220px;
			z-index: 99;
		}

		.hamburger-btn { display: flex; }
	}

	/* ── Profile card ──────────────────────────────────────────────────────── */
	.pc-overlay {
		position: fixed; inset: 0; z-index: 300;
	}
	.profile-card {
		position: fixed;
		z-index: 301;
		width: 248px;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 40px rgba(0,0,0,0.55);
		overflow: hidden;
	}
	.pc-avatar-wrap {
		width: 100%;
		height: 72px;
		background: var(--bg-elevated);
		display: flex;
		align-items: flex-end;
		padding: 0 1rem;
	}
	.pc-avatar-img {
		width: 64px; height: 64px; border-radius: 50%;
		object-fit: cover;
		border: 4px solid var(--bg-surface);
		transform: translateY(32px);
		flex-shrink: 0;
	}
	.pc-avatar-init {
		width: 64px; height: 64px; border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex; align-items: center; justify-content: center;
		font-size: 1.4rem; font-weight: 700;
		border: 4px solid var(--bg-surface);
		transform: translateY(32px);
		flex-shrink: 0;
	}
	.pc-body {
		padding: 2.6rem 1rem 0.75rem;
		display: flex; flex-direction: column; gap: 0.1rem;
	}
	.pc-displayname { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
	.pc-tag { font-size: 0.72rem; color: var(--text-muted); }
	.pc-role { font-size: 0.7rem; font-weight: 600; margin-top: 0.2rem; }
	.pc-actions {
		padding: 0.5rem 1rem 0.75rem;
		display: flex; gap: 0.4rem; flex-wrap: wrap;
	}
	.pc-dm-btn {
		flex: 1;
		padding: 0.4rem 0.75rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none; border-radius: var(--radius);
		cursor: pointer; font-size: 0.8rem; font-weight: 600;
		font-family: inherit;
		transition: opacity var(--transition);
	}
	.pc-dm-btn:hover { opacity: 0.85; }
	.pc-kick-btn {
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--error);
		color: var(--error);
		border-radius: var(--radius);
		cursor: pointer; font-size: 0.78rem;
		font-family: inherit;
		transition: background var(--transition);
	}
	.pc-kick-btn:hover { background: var(--error-surface); }
</style>

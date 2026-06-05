<script lang="ts">
	import { onMount } from 'svelte';
	import { X, MessageSquare, UserPlus, UserMinus, UserCheck, Pencil, Calendar, Ban, Flag } from 'lucide-svelte';
	import { authStore } from '$lib/auth.js';

	interface ProfileData {
		id: string;
		username: string;
		name?: string | null;
		avatarUrl?: string | null;
		bio?: string | null;
		pronouns?: string | null;
		bannerColor?: string | null;
		createdAt: string;
		friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked_by_me' | 'blocked_by_them';
		friendshipId: string | null;
		mutualFriends: { id: string; username: string; name?: string | null; avatarUrl?: string | null }[];
		mutualServers: { id: string; name: string; slug: string; iconUrl?: string | null }[];
	}

	let {
		targetUserId,
		viewerId,
		serverSlug = null,
		canManage = false,
		onclose,
		onOpenDm,
		onKick,
		onNicknameChange,
		// legacy nickname passed from server page
		nickname: initialNickname = null,
		role = null,
	}: {
		targetUserId: string;
		viewerId: string;
		serverSlug?: string | null;
		canManage?: boolean;
		onclose: () => void;
		onOpenDm?: (uid: string) => void;
		onKick?: (uid: string, username: string) => void;
		onNicknameChange?: (uid: string, nickname: string | null) => void;
		nickname?: string | null;
		role?: { name: string; color?: string | null } | null;
	} = $props();

	const user = authStore.user;

	let profile = $state<ProfileData | null>(null);
	let loading = $state(true);
	let error = $state('');

	// Nickname editing
	let editingNickname = $state(false);
	let nicknameInput = $state('');
	let nicknameSaving = $state(false);
	// svelte-ignore state_referenced_locally
	let localNickname = $state<string | null>(initialNickname);

	// Friend action loading
	let friendLoading = $state(false);

	// Report modal
	const REPORT_REASONS = ['Spam', 'Acoso o intimidación', 'Contenido inapropiado', 'Suplantación de identidad', 'Otro'];
	let showReport = $state(false);
	let reportReason = $state('');
	let reportDetails = $state('');
	let reportLoading = $state(false);
	let reportDone = $state(false);
	let reportError = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`/api/users/${targetUserId}/profile`, { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar el perfil');
			profile = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error';
		} finally {
			loading = false;
		}
	});

	function avatarInitial(u: string) { return u[0].toUpperCase(); }

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function bannerStyle(color: string | null | undefined) {
		return color
			? `background: ${color}`
			: 'background: linear-gradient(135deg, var(--accent), var(--accent-strong))';
	}

	async function saveNickname(e: SubmitEvent) {
		e.preventDefault();
		if (nicknameSaving || !serverSlug) return;
		nicknameSaving = true;
		try {
			const res = await fetch(`/api/servers/${serverSlug}/members/${targetUserId}/nickname`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ nickname: nicknameInput.trim() || null }),
			});
			if (res.ok) {
				localNickname = nicknameInput.trim() || null;
				onNicknameChange?.(targetUserId, localNickname);
				editingNickname = false;
			}
		} finally {
			nicknameSaving = false;
		}
	}

	async function handleFriendAction() {
		if (!profile || friendLoading) return;
		friendLoading = true;
		try {
			if (profile.friendshipStatus === 'none') {
				const res = await fetch('/api/friends/request', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ identifier: profile.username }),
				});
				if (res.ok) profile = { ...profile, friendshipStatus: 'pending_sent' };
			} else if (profile.friendshipStatus === 'pending_received') {
				const res = await fetch(`/api/friends/accept/${profile.friendshipId}`, {
					method: 'POST',
					credentials: 'include',
				});
				if (res.ok) profile = { ...profile, friendshipStatus: 'accepted' };
			} else if (profile.friendshipStatus === 'accepted' || profile.friendshipStatus === 'pending_sent') {
				const res = await fetch(`/api/friends/${profile.friendshipId}`, {
					method: 'DELETE',
					credentials: 'include',
				});
				if (res.ok) profile = { ...profile, friendshipStatus: 'none', friendshipId: null };
			}
		} finally {
			friendLoading = false;
		}
	}

	async function handleBlock() {
		if (!profile || friendLoading) return;
		friendLoading = true;
		try {
			if (profile.friendshipStatus === 'blocked_by_me') {
				const res = await fetch(`/api/friends/block/${profile.id}`, {
					method: 'DELETE',
					credentials: 'include',
				});
				if (res.ok) profile = { ...profile, friendshipStatus: 'none', friendshipId: null };
			} else {
				const res = await fetch(`/api/friends/block/${profile.id}`, {
					method: 'POST',
					credentials: 'include',
				});
				if (res.ok) profile = { ...profile, friendshipStatus: 'blocked_by_me' };
			}
		} finally {
			friendLoading = false;
		}
	}

	async function submitReport(e: SubmitEvent) {
		e.preventDefault();
		if (!profile || reportLoading || !reportReason) return;
		reportLoading = true; reportError = '';
		try {
			const res = await fetch(`/api/users/${profile.id}/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() || undefined }),
			});
			if (res.ok) {
				reportDone = true;
			} else {
				const err = await res.json().catch(() => ({}));
				reportError = err.message ?? 'Error al enviar el reporte';
			}
		} finally {
			reportLoading = false;
		}
	}

	function friendBtnLabel(status: string) {
		if (status === 'accepted') return 'Eliminar amigo';
		if (status === 'pending_sent') return 'Solicitud enviada';
		if (status === 'pending_received') return 'Aceptar solicitud';
		if (status === 'blocked_by_them') return 'No disponible';
		return 'Añadir amigo';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="uprofile-overlay" onclick={onclose} onkeydown={() => {}}></div>

<div class="uprofile-card big" role="dialog" aria-modal="true">
	<!-- Banner -->
	<div class="uprofile-banner" style={bannerStyle(profile?.bannerColor)}>
		<button class="uprofile-x" onclick={onclose} aria-label="Cerrar"><X size={15} /></button>
	</div>

	{#if loading}
		<div class="uprofile-loading">Cargando…</div>
	{:else if error}
		<div class="uprofile-loading uprofile-error">{error}</div>
	{:else if profile}
		<!-- Head row: avatar + edit btn -->
		<div class="uprofile-head">
			<div class="uprofile-avatar">
				{#if profile.avatarUrl}
					<img src={profile.avatarUrl} alt="" />
				{:else}
					<span>{avatarInitial(profile.username)}</span>
				{/if}
			</div>
			{#if serverSlug && (canManage || profile.id === viewerId)}
				<button class="uprofile-edit uprofile-act" onclick={() => { nicknameInput = localNickname ?? ''; editingNickname = !editingNickname; }}>
					<Pencil size={14} /> Apodo
				</button>
			{/if}
		</div>

		<!-- Body -->
		<div class="uprofile-body">
			<!-- Identity -->
			<div class="uprofile-idline">
				<div>
					<div class="uprofile-name">{localNickname ?? profile.name ?? profile.username}</div>
					{#if profile.pronouns}
						<span class="uprofile-pronouns">{profile.pronouns}</span>
					{/if}
					<div class="uprofile-tag">@{profile.username}</div>
				</div>
				{#if role}
					<span class="uprofile-role-chip" style="color:{role.color ?? 'var(--text-muted)'}; border-color:{role.color ?? 'var(--border)'}">
						{role.name}
					</span>
				{/if}
			</div>

			<!-- Nickname editing (inline, server only) -->
			{#if editingNickname && serverSlug}
				<form class="uprofile-nick-form" onsubmit={saveNickname}>
					<input class="uprofile-nick-input" bind:value={nicknameInput} placeholder="Apodo (vacío para quitar)" maxlength="32" />
					<div class="uprofile-nick-actions">
						<button type="submit" class="uprofile-nick-save" disabled={nicknameSaving}>{nicknameSaving ? '…' : 'Guardar'}</button>
						<button type="button" class="uprofile-nick-cancel" onclick={() => (editingNickname = false)}>Cancelar</button>
					</div>
				</form>
			{/if}

			<!-- Action buttons -->
			{#if profile.id !== viewerId}
				<div class="uprofile-actions">
					{#if profile.friendshipStatus === 'blocked_by_me'}
						<!-- blocked: only show unblock -->
						<div class="uprofile-blocked-banner"><Ban size={14} /> Usuario bloqueado</div>
						<button class="uprofile-act" onclick={handleBlock} disabled={friendLoading}>
							<Ban size={16} /> Desbloquear
						</button>
					{:else}
						{#if onOpenDm && profile.friendshipStatus !== 'blocked_by_them'}
							<button class="uprofile-act primary" onclick={() => onOpenDm?.(profile!.id)}>
								<MessageSquare size={16} /> Mensaje
							</button>
						{/if}
						{#if profile.friendshipStatus !== 'blocked_by_them'}
							<button
								class="uprofile-act"
								class:primary-soft={profile.friendshipStatus === 'none' || profile.friendshipStatus === 'pending_received'}
								onclick={handleFriendAction}
								disabled={friendLoading}
							>
								{#if profile.friendshipStatus === 'accepted'}
									<UserMinus size={16} />
								{:else if profile.friendshipStatus === 'pending_sent'}
									<UserCheck size={16} />
								{:else}
									<UserPlus size={16} />
								{/if}
								{friendBtnLabel(profile.friendshipStatus)}
							</button>
						{/if}
						<button class="uprofile-act" onclick={handleBlock} disabled={friendLoading} title="Bloquear usuario">
							<Ban size={16} />
						</button>
						<button class="uprofile-act" onclick={() => { showReport = true; reportReason = ''; reportDetails = ''; reportDone = false; reportError = ''; }} title="Reportar usuario">
							<Flag size={16} />
						</button>
						{#if canManage && onKick}
							<button class="uprofile-act danger" onclick={() => onKick?.(profile!.id, profile!.username)}>
								Expulsar
							</button>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Scrollable sections -->
			<div class="uprofile-scroll">
				<!-- Bio -->
				{#if profile.bio}
					<div class="uprofile-section">
						<div class="uprofile-label">Sobre mí</div>
						<p class="uprofile-bio">{profile.bio}</p>
					</div>
				{/if}

				<!-- Member since + mutual info -->
				<div class="uprofile-section">
					<div class="uprofile-label"><Calendar size={11} /> Miembro desde</div>
					<div class="uprofile-meta">{formatDate(profile.createdAt)}</div>
				</div>

				<!-- Mutual friends + mutual servers (2-col grid if both exist) -->
				{#if profile.mutualFriends.length > 0 || profile.mutualServers.length > 0}
					<div class="uprofile-grid2">
						{#if profile.mutualFriends.length > 0}
							<div class="uprofile-section">
								<div class="uprofile-label">Amigos mutuos — {profile.mutualFriends.length}</div>
								<div class="mutual-friends">
									{#each profile.mutualFriends as mf (mf.id)}
										<div class="mutual-friend">
											<div class="mutual-avatar">
												{#if mf.avatarUrl}
													<img src={mf.avatarUrl} alt="" />
												{:else}
													<span>{avatarInitial(mf.username)}</span>
												{/if}
											</div>
											<span class="mutual-fname">{mf.name ?? mf.username}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						{#if profile.mutualServers.length > 0}
							<div class="uprofile-section">
								<div class="uprofile-label">Servidores mutuos — {profile.mutualServers.length}</div>
								<div class="mutual-servers">
									{#each profile.mutualServers as srv (srv.id)}
										<div class="mutual-server">
											<div class="mutual-srv-badge">
												{#if srv.iconUrl}
													<img src={srv.iconUrl} alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />
												{:else}
													{srv.name[0].toUpperCase()}
												{/if}
											</div>
											<span class="mutual-sname">{srv.name}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Report modal -->
{#if showReport && profile}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="report-overlay" onclick={() => (showReport = false)} onkeydown={() => {}}></div>
	<div class="report-modal" role="dialog" aria-modal="true">
		<div class="report-header">
			<span class="report-title">Reportar a @{profile.username}</span>
			<button class="uprofile-x" onclick={() => (showReport = false)} aria-label="Cerrar"><X size={15} /></button>
		</div>
		{#if reportDone}
			<div class="report-done">
				<p>Reporte enviado. Nuestro equipo lo revisará.</p>
				<button class="uprofile-act primary" onclick={() => { showReport = false; }}>Cerrar</button>
			</div>
		{:else}
			<form class="report-form" onsubmit={submitReport}>
				<div class="report-reason-grid">
					{#each REPORT_REASONS as r}
						<label class="report-reason-opt" class:selected={reportReason === r}>
							<input type="radio" name="reason" value={r} bind:group={reportReason} />
							{r}
						</label>
					{/each}
				</div>
				<textarea class="report-details" bind:value={reportDetails} placeholder="Detalles adicionales (opcional)" maxlength="500" rows="3"></textarea>
				{#if reportError}<p class="report-error">{reportError}</p>{/if}
				<button type="submit" class="uprofile-act primary" disabled={!reportReason || reportLoading}>
					{reportLoading ? 'Enviando…' : 'Enviar reporte'}
				</button>
			</form>
		{/if}
	</div>
{/if}

<style>
	.uprofile-overlay {
		position: fixed; inset: 0; z-index: 299;
		background: rgba(0,0,0,0.5);
	}

	.uprofile-card {
		position: fixed; z-index: 300;
		top: 50%; left: 50%; transform: translate(-50%, -50%);
		width: 480px; max-width: calc(100vw - 2rem);
		max-height: 88vh;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		display: flex; flex-direction: column; overflow: hidden;
	}

	.uprofile-banner {
		height: 120px; position: relative; flex-shrink: 0;
	}

	.uprofile-x {
		position: absolute; top: 0.6rem; right: 0.6rem;
		width: 28px; height: 28px; border-radius: 50%; border: none;
		background: rgba(0,0,0,0.32); color: #fff; cursor: pointer;
		display: grid; place-items: center; transition: background var(--transition);
	}
	.uprofile-x:hover { background: rgba(0,0,0,0.5); }
	:global(.uprofile-x svg) { width: 15px; height: 15px; }

	.uprofile-head {
		display: flex; align-items: flex-end; justify-content: space-between;
		padding: 0 1.1rem; margin-top: -52px; flex-shrink: 0;
	}

	.uprofile-avatar {
		width: 104px; height: 104px; border-radius: 50%;
		border: 5px solid var(--bg-surface);
		background: var(--bg-elevated);
		display: flex; align-items: center; justify-content: center;
		font-size: 2.5rem; font-weight: 700; color: var(--accent);
		flex-shrink: 0; overflow: hidden;
	}
	.uprofile-avatar img { width: 100%; height: 100%; object-fit: cover; }

	.uprofile-body {
		padding: 0.6rem 1.1rem 1.1rem;
		display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: hidden;
	}

	.uprofile-idline { margin-top: 0.3rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.8rem; }
	.uprofile-name { font-size: 1.35rem; font-weight: 800; color: var(--text-primary); }
	.uprofile-pronouns { font-size: 0.78rem; color: var(--text-muted); margin-right: 0.3rem; }
	.uprofile-tag { font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem; }
	.uprofile-role-chip {
		font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.5rem;
		border: 1px solid; border-radius: var(--radius-pill);
		white-space: nowrap; margin-top: 0.25rem;
	}

	/* Actions */
	.uprofile-actions { display: flex; gap: 0.5rem; margin-top: 0.85rem; flex-wrap: wrap; }
	.uprofile-act {
		display: inline-flex; align-items: center; gap: 0.4rem;
		padding: 0.45rem 0.85rem; border: 1px solid var(--border-strong);
		border-radius: var(--radius); font-size: 0.82rem; font-weight: 600;
		background: transparent; color: var(--text-secondary); cursor: pointer;
		font-family: inherit; transition: border-color var(--transition), background var(--transition), color var(--transition);
	}
	:global(.uprofile-act svg) { width: 16px; height: 16px; }
	.uprofile-act:hover:not(:disabled) { border-color: var(--border-strong); background: var(--bg-hover); }
	.uprofile-act.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
	.uprofile-act.primary:hover { filter: brightness(1.06); background: var(--accent); }
	.uprofile-act.primary-soft { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
	.uprofile-act.primary-soft:hover:not(:disabled) { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
	.uprofile-act.danger { border-color: var(--error); color: var(--error); }
	.uprofile-act.danger:hover { background: var(--error-surface); }

	.uprofile-blocked-banner {
		display: flex; align-items: center; gap: 0.4rem;
		font-size: 0.75rem; font-weight: 600; color: var(--error);
		background: var(--error-surface); border: 1px solid var(--error);
		border-radius: var(--radius); padding: 0.3rem 0.65rem;
	}
	:global(.uprofile-blocked-banner svg) { width: 14px; height: 14px; flex-shrink: 0; }
	.uprofile-act:disabled { opacity: 0.6; cursor: not-allowed; }

	/* Scroll area */
	.uprofile-scroll {
		margin-top: 0.85rem; overflow-y: auto; flex: 1; min-height: 0;
		display: flex; flex-direction: column; gap: 0.8rem;
		padding-right: 0.2rem;
	}
	.uprofile-section {
		background: var(--bg-base); border: 1px solid var(--border);
		border-radius: var(--radius-lg); padding: 0.85rem 0.95rem; flex-shrink: 0;
	}
	.uprofile-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
	.uprofile-grid2 .uprofile-section { margin: 0; }
	.uprofile-label {
		font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700;
		letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted);
		margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.3rem;
	}
	:global(.uprofile-label svg) { width: 11px; height: 11px; }
	.uprofile-bio { font-size: 0.84rem; color: var(--text-secondary); line-height: 1.55; margin: 0; }
	.uprofile-meta { font-size: 0.82rem; color: var(--text-secondary); }

	/* Mutual friends */
	.mutual-friends { display: flex; flex-direction: column; gap: 0.1rem; }
	.mutual-friend { display: flex; align-items: center; gap: 0.55rem; padding: 0.3rem 0.35rem; border-radius: var(--radius); }
	.mutual-avatar {
		width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
		background: var(--accent); display: flex; align-items: center; justify-content: center;
		font-size: 0.72rem; font-weight: 700; color: var(--accent-text); overflow: hidden;
	}
	.mutual-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.mutual-fname { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Mutual servers */
	.mutual-servers { display: flex; flex-direction: column; gap: 0.35rem; }
	.mutual-server { display: flex; align-items: center; gap: 0.55rem; }
	.mutual-srv-badge {
		width: 34px; height: 34px; border-radius: var(--radius); flex-shrink: 0;
		background: var(--bg-elevated); border: 1px solid var(--border);
		display: grid; place-items: center; font-weight: 800; font-size: 0.88rem; color: var(--text-primary);
		overflow: hidden;
	}
	.mutual-sname { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Nickname editing */
	.uprofile-nick-form { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
	.uprofile-nick-input {
		font-size: 0.82rem; padding: 0.4rem 0.5rem;
		background: var(--bg-elevated); border: 1px solid var(--border-focus);
		border-radius: var(--radius); color: var(--text-primary); outline: none; font-family: inherit;
	}
	.uprofile-nick-actions { display: flex; gap: 0.35rem; }
	.uprofile-nick-save {
		flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem; font-weight: 700;
		background: var(--accent); color: var(--accent-text); border: none;
		border-radius: var(--radius); cursor: pointer; font-family: inherit;
	}
	.uprofile-nick-save:disabled { opacity: 0.5; cursor: not-allowed; }
	.uprofile-nick-cancel {
		flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem;
		background: transparent; border: 1px solid var(--border-strong);
		color: var(--text-muted); border-radius: var(--radius); cursor: pointer; font-family: inherit;
	}

	/* Loading / error */
	.uprofile-loading { padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
	.uprofile-error { color: var(--error); }

	/* Report modal */
	.report-overlay { position: fixed; inset: 0; z-index: 400; }
	.report-modal {
		position: fixed; z-index: 401;
		top: 50%; left: 50%; transform: translate(-50%, -50%);
		width: 380px; max-width: calc(100vw - 2rem);
		background: var(--bg-surface); border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-pop);
		padding: 1.2rem; display: flex; flex-direction: column; gap: 0.9rem;
	}
	.report-header { display: flex; align-items: center; justify-content: space-between; }
	.report-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
	.report-form { display: flex; flex-direction: column; gap: 0.75rem; }
	.report-reason-grid { display: flex; flex-direction: column; gap: 0.35rem; }
	.report-reason-opt {
		display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem;
		border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;
		font-size: 0.84rem; color: var(--text-secondary); transition: all var(--transition);
	}
	.report-reason-opt input { display: none; }
	.report-reason-opt.selected { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); font-weight: 600; }
	.report-reason-opt:hover:not(.selected) { background: var(--bg-hover); }
	.report-details {
		font-size: 0.82rem; padding: 0.5rem 0.6rem; resize: vertical;
		background: var(--bg-elevated); border: 1px solid var(--border);
		border-radius: var(--radius); color: var(--text-primary); font-family: inherit; outline: none;
	}
	.report-details:focus { border-color: var(--border-focus); }
	.report-error { font-size: 0.76rem; color: var(--error); margin: 0; }
	.report-done { display: flex; flex-direction: column; gap: 0.6rem; }
	.report-done p { font-size: 0.86rem; color: var(--text-secondary); margin: 0; }
</style>

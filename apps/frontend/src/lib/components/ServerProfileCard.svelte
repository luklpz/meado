<script lang="ts">
	import { untrack } from 'svelte';
	import { Pencil, MessageSquare } from 'lucide-svelte';

	interface CardData {
		userId: string;
		username: string;
		name?: string | null;
		avatarUrl?: string | null;
		nickname?: string | null;
		role?: { name: string; color?: string | null } | null;
		x: number;
		y: number;
	}

	let {
		card,
		serverSlug,
		userId,
		canManage,
		onclose,
		onOpenDm,
		onKick,
		onNicknameChange,
	}: {
		card: CardData;
		serverSlug: string;
		userId: string;
		canManage: boolean;
		onclose: () => void;
		onOpenDm: (uid: string) => void;
		onKick: (uid: string, username: string) => void;
		onNicknameChange: (uid: string, nickname: string | null) => void;
	} = $props();

	let editingNickname = $state(false);
	let nicknameInput = $state('');
	let nicknameSaving = $state(false);
	let localNickname = $state<string | null>(untrack(() => card.nickname ?? null));
	$effect(() => { localNickname = card.nickname ?? null; });

	function avatarInitial(u: string) { return u[0].toUpperCase(); }

	function startEdit() {
		nicknameInput = localNickname ?? '';
		editingNickname = true;
	}

	async function saveNickname(e: SubmitEvent) {
		e.preventDefault();
		if (nicknameSaving) return;
		nicknameSaving = true;
		try {
			const res = await fetch(`/api/servers/${serverSlug}/members/${card.userId}/nickname`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ nickname: nicknameInput.trim() || null }),
			});
			if (res.ok) {
				localNickname = nicknameInput.trim() || null;
				onNicknameChange(card.userId, localNickname);
				editingNickname = false;
			}
		} finally {
			nicknameSaving = false;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pc-overlay" onclick={() => { onclose(); }} onkeydown={() => {}}></div>
<div class="profile-card" style="top:{card.y}px; left:{card.x}px;">
	<div class="pc-avatar-wrap">
		{#if card.avatarUrl}
			<img src={card.avatarUrl} class="pc-avatar-img" alt="" />
		{:else}
			<div class="pc-avatar-init">{avatarInitial(card.username)}</div>
		{/if}
	</div>
	<div class="pc-body">
		{#if editingNickname}
			<form class="pc-nick-form" onsubmit={saveNickname}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="pc-nick-input"
					bind:value={nicknameInput}
					placeholder="Apodo (vacío para quitar)"
					maxlength="32"
					autofocus
				/>
				<div class="pc-nick-actions">
					<button type="submit" class="pc-nick-save" disabled={nicknameSaving}>
						{nicknameSaving ? '…' : 'Guardar'}
					</button>
					<button type="button" class="pc-nick-cancel" onclick={() => (editingNickname = false)}>
						Cancelar
					</button>
				</div>
			</form>
		{:else}
			<div class="pc-displayname">{localNickname ?? card.name ?? card.username}</div>
			{#if localNickname || card.name}
				<div class="pc-tag">@{card.username}</div>
			{/if}
			{#if card.role}
				<div class="pc-role" style="color:{card.role.color ?? 'var(--text-muted)'}">
					{card.role.name}
				</div>
			{/if}
		{/if}
	</div>
	<div class="pc-actions">
		{#if card.userId !== userId}
			<button class="pc-dm-btn" onclick={() => onOpenDm(card.userId)}>
				<MessageSquare size={14} /> Enviar mensaje
			</button>
		{/if}
		{#if canManage || card.userId === userId}
			<button class="pc-edit-nick-btn" onclick={startEdit}>
				<Pencil size={12} /> Editar apodo
			</button>
		{/if}
		{#if canManage && card.userId !== userId}
			<button class="pc-kick-btn" onclick={() => onKick(card.userId, card.username)}>
				Expulsar
			</button>
		{/if}
	</div>
</div>

<style>
	.pc-overlay {
		position: fixed;
		inset: 0;
		z-index: 199;
	}

	.profile-card {
		position: fixed;
		z-index: 200;
		width: 248px;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0,0,0,0.45);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.pc-avatar-wrap {
		width: 100%;
		height: 80px;
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		padding: 0.75rem;
	}

	.pc-avatar-img {
		width: 52px; height: 52px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid var(--bg-surface);
	}

	.pc-avatar-init {
		width: 52px; height: 52px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex; align-items: center; justify-content: center;
		font-size: 1.3rem; font-weight: 700;
		border: 3px solid var(--bg-surface);
	}

	.pc-body { padding: 0.5rem 0.75rem 0.25rem; }
	.pc-displayname { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
	.pc-tag { font-size: 0.72rem; color: var(--text-muted); }
	.pc-role { font-size: 0.72rem; font-weight: 600; margin-top: 0.25rem; }

	.pc-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem 0.75rem 0.75rem;
	}

	.pc-dm-btn {
		display: flex; align-items: center; gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer; font-size: 0.78rem; font-weight: 700;
		font-family: inherit;
		transition: opacity var(--transition);
	}
	.pc-dm-btn:hover { opacity: 0.85; }

	.pc-edit-nick-btn {
		display: flex; align-items: center; gap: 0.3rem;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		border-radius: var(--radius);
		cursor: pointer; font-size: 0.78rem;
		font-family: inherit;
		transition: border-color var(--transition), color var(--transition);
	}
	.pc-edit-nick-btn:hover { border-color: var(--accent); color: var(--accent); }

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

	.pc-nick-form { display: flex; flex-direction: column; gap: 0.4rem; }
	.pc-nick-input {
		font-size: 0.8rem;
		padding: 0.35rem 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border-focus);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		font-family: inherit;
	}
	.pc-nick-actions { display: flex; gap: 0.4rem; }
	.pc-nick-save {
		flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem; font-weight: 700;
		background: var(--accent); color: var(--accent-text);
		border: none; border-radius: var(--radius); cursor: pointer; font-family: inherit;
	}
	.pc-nick-save:disabled { opacity: 0.5; cursor: not-allowed; }
	.pc-nick-cancel {
		flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem;
		background: transparent; border: 1px solid var(--border-strong);
		color: var(--text-muted); border-radius: var(--radius); cursor: pointer; font-family: inherit;
	}
</style>

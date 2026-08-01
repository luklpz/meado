<script lang="ts">
	import { onMount } from 'svelte';
	import { socketStore } from '$lib/socket.js';
	import { authStore } from '$lib/auth.js';

	interface Props {
		roomSlug: string;
		username: string;
	}
	let { roomSlug: _roomSlug, username: _username }: Props = $props();

	// El mapa 2D/Phaser (room:join, player:move, player:moved, etc.) está
	// fuera de alcance de la migración a Cloudflare (plan de migración,
	// fase 3) — confirmado que el backend nunca implementó esos eventos, ni
	// antes (Socket.io) ni ahora (Durable Objects). No es una regresión de
	// esta fase, ya estaba roto (protocolo "Phase 2" sin servidor real
	// detrás). Se deja sin construir el juego para no fallar de forma
	// confusa contra el socket de sesión nuevo, que no tiene el mismo
	// contrato (.id, .once, eventos room:*) que ese código esperaba.
	onMount(async () => {
		let socketToken = authStore.getSocketToken();
		if (!socketToken) {
			await authStore.init();
			socketToken = authStore.getSocketToken();
		}
		if (socketToken) socketStore.connect(socketToken);
		console.warn('Servidor espacial (Phaser): funcionalidad no implementada en el backend — ver objetivos.md');
	});
</script>

<div class="game-container">
	<p class="game-unavailable">Mapa 2D no disponible todavía.</p>
</div>

<style>
	.game-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 800px;
		max-width: 100%;
		height: 600px;
		border: 1px solid #1a3320;
		border-radius: 4px;
		background: #0a1a0f;
	}

	.game-unavailable {
		color: var(--text-muted, #6b7280);
		font-size: 0.9rem;
	}
</style>

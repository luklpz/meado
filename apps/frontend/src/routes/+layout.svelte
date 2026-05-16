<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/auth.js';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';

	let { data, children } = $props();

	onMount(() => {
		authStore.init();
	});

	const user = $derived(data.user);
	const servers = $derived((data.servers ?? []) as any[]);
	const myServers = $derived(servers.filter((s: any) => s.isMember));

	function isActiveServer(slug: string) {
		return $page.url.pathname.startsWith(`/servers/${slug}`);
	}

	const isHome = $derived($page.url.pathname.startsWith('/home'));
</script>

{#if user}
	<div class="app-shell">
		<!-- Server rail -->
		<nav class="rail" aria-label="Servidores">
			<a href="/home" class="rail-btn home-btn" class:active={isHome} title="Inicio" aria-label="Inicio">
				<span class="home-icon">M</span>
			</a>

			<div class="rail-separator"></div>

			{#each myServers as srv (srv.id)}
				<a
					href="/servers/{srv.slug}"
					class="rail-btn server-btn"
					class:active={isActiveServer(srv.slug)}
					title={srv.name}
					aria-label={srv.name}
				>
					{#if srv.iconUrl}
						<img src={srv.iconUrl} alt={srv.name} class="server-icon-img" />
					{:else}
						<span class="server-initial">{srv.name[0].toUpperCase()}</span>
					{/if}
					<div class="active-indicator"></div>
				</a>
			{/each}

			<button
				class="rail-btn add-btn"
				title="Añadir o explorar servidores"
				aria-label="Añadir servidor"
				onclick={() => goto('/servers')}
			>
				<span class="add-icon">+</span>
			</button>

			<div class="rail-spacer"></div>

			<ProfileMenu />
		</nav>

		<div class="app-content">
			{@render children()}
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.app-shell {
		display: flex;
		height: 100dvh;
		overflow: hidden;
		background: var(--bg-base);
	}

	.rail {
		width: 72px;
		flex-shrink: 0;
		background: var(--bg-elevated);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 0 0.5rem;
		gap: 0.25rem;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
	}

	.rail::-webkit-scrollbar { display: none; }

	.rail-separator {
		width: 32px;
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
		flex-shrink: 0;
	}

	.rail-spacer { flex: 1; }

	.rail-btn {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-radius 0.15s ease, background 0.15s ease;
		flex-shrink: 0;
		text-decoration: none;
		border: none;
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-family: inherit;
		overflow: hidden;
	}

	.rail-btn:hover {
		border-radius: var(--radius-lg);
		background: var(--accent);
		color: var(--accent-text);
	}

	.rail-btn.active {
		border-radius: var(--radius-lg);
		background: var(--accent);
		color: var(--accent-text);
	}

	.active-indicator {
		position: absolute;
		left: -4px;
		top: 50%;
		transform: translateY(-50%) scaleY(0);
		width: 4px;
		height: 8px;
		border-radius: 0 2px 2px 0;
		background: var(--text-primary);
		transition: transform 0.15s ease, height 0.15s ease;
	}

	.rail-btn.active .active-indicator {
		transform: translateY(-50%) scaleY(1);
		height: 40px;
	}

	.home-btn {
		background: var(--accent);
		color: var(--accent-text);
	}

	.home-btn:hover { border-radius: var(--radius-lg); }

	.home-icon {
		font-size: 1.3rem;
		font-weight: 900;
		letter-spacing: -0.05em;
	}

	.server-icon-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.server-initial {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-secondary);
	}

	.add-btn {
		background: var(--bg-surface);
		border: 2px dashed var(--border-strong);
	}

	.add-btn:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.add-icon {
		font-size: 1.4rem;
		font-weight: 300;
		line-height: 1;
	}

	.app-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>

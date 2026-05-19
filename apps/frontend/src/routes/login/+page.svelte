<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/auth.js';
	import { CheckCircle2 } from 'lucide-svelte';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	const verified = $derived($page.url.searchParams.get('verified') === '1');
	const tokenError = $derived($page.url.searchParams.get('error') === 'invalid-token');
	const resetOk = $derived($page.url.searchParams.get('reset') === '1');

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await authStore.login(email, password);
			await invalidateAll();
			goto('/home');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al iniciar sesión.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Inicio de sesión</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>

		{#if verified}
			<div class="notice notice--ok"><CheckCircle2 size={13} /> Email verificado. Ya puedes iniciar sesión.</div>
		{/if}
		{#if resetOk}
			<div class="notice notice--ok"><CheckCircle2 size={13} /> Contraseña actualizada. Ya puedes iniciar sesión.</div>
		{/if}
		{#if tokenError}
			<div class="notice notice--err">
				El enlace de verificación no es válido o ha expirado. Regístrate de nuevo.
			</div>
		{/if}

		<form onsubmit={handleLogin}>
			<label>
				<span>Email</span>
				<input type="email" bind:value={email} autocomplete="email" required />
			</label>
			<label>
				<span>Contraseña</span>
				<input type="password" bind:value={password} autocomplete="current-password" required />
			</label>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button type="submit" disabled={loading}>
				{loading ? 'Entrando…' : 'Entrar'}
			</button>
		</form>

		<div class="links">
			<a href="/forgot-password{email ? `?email=${encodeURIComponent(email)}` : ''}">¿Olvidaste tu contraseña?</a>
			<a href="/register">Crear cuenta</a>
		</div>
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 1rem;
		background: var(--bg-base);
		position: relative;
	}

	.page::before {
		content: '';
		position: fixed;
		inset: 0;
		background: var(--auth-bg-glow, none);
		pointer-events: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 2.25rem 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		box-shadow: var(--shadow-card);
		width: 100%;
		max-width: 360px;
		position: relative;
		z-index: 1;
	}

	.logo {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--accent);
		text-align: center;
		text-transform: lowercase;
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius);
		line-height: 1.5;
	}

	.notice--ok {
		background: var(--success-surface);
		border: 1px solid var(--success-border);
		color: var(--success);
	}

	.notice--err {
		background: var(--error-surface);
		border: 1px solid var(--error-border);
		color: var(--error);
	}

	form { display: flex; flex-direction: column; gap: 0.75rem; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	input {
		font-size: 0.85rem;
		padding: 0.5rem 0.65rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		transition: border-color var(--transition);
	}

	input:focus { border-color: var(--border-focus); }

	button {
		font-size: 0.85rem;
		padding: 0.6rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 700;
		transition: opacity var(--transition);
		margin-top: 0.25rem;
	}

	button:hover:not(:disabled) { opacity: 0.88; }
	button:disabled { opacity: 0.45; cursor: not-allowed; }

	.error { font-size: 0.75rem; color: var(--error); }

	.links {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.links a { color: var(--text-muted); transition: color var(--transition); }
	.links a:hover { color: var(--accent); text-decoration: none; }
</style>

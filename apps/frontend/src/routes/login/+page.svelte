<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/auth.js';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	// Mensajes procedentes de la verificación de email o de otros flujos
	const verified = $derived($page.url.searchParams.get('verified') === '1');
	const tokenError = $derived($page.url.searchParams.get('error') === 'invalid-token');

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await authStore.login(username, password);
			goto('/rooms');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al iniciar sesión';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Login</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>

		{#if verified}
			<div class="notice notice--ok">
				✓ Email verificado. Ya puedes iniciar sesión.
			</div>
		{/if}

		{#if tokenError}
			<div class="notice notice--err">
				El enlace de verificación no es válido o ha expirado. Regístrate de nuevo.
			</div>
		{/if}

		<form onsubmit={handleLogin}>
			<label>
				<span>usuario</span>
				<input type="text" bind:value={username} autocomplete="username" required />
			</label>
			<label>
				<span>contraseña</span>
				<input type="password" bind:value={password}
					autocomplete="current-password" required />
			</label>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button type="submit" disabled={loading}>
				{loading ? 'entrando…' : 'entrar'}
			</button>
		</form>

		<p class="link">¿Sin cuenta? <a href="/register">registrarse</a></p>
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #050d07;
		font-family: monospace;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 2rem;
		border: 1px solid #1a3320;
		border-radius: 6px;
		background: #080f0a;
		width: 320px;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: #22c55e;
		text-align: center;
		margin: 0;
	}

	.notice {
		font-size: 0.78rem;
		padding: 0.6rem 0.75rem;
		border-radius: 3px;
		line-height: 1.4;
	}

	.notice--ok {
		background: #0a1a0f;
		border: 1px solid #22c55e44;
		color: #22c55e;
	}

	.notice--err {
		background: #1a0a0a;
		border: 1px solid #ef444444;
		color: #ef4444;
	}

	form { display: flex; flex-direction: column; gap: 0.75rem; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: #6b7280;
	}

	input {
		font-family: monospace;
		font-size: 0.85rem;
		padding: 0.45rem 0.6rem;
		background: #0a1a0f;
		border: 1px solid #1a3320;
		border-radius: 3px;
		color: #d1fae5;
		outline: none;
		transition: border-color 0.15s;
	}

	input:focus { border-color: #22c55e; }

	button {
		font-family: monospace;
		font-size: 0.85rem;
		padding: 0.55rem;
		background: #22c55e;
		color: #050d07;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-weight: 700;
		transition: opacity 0.15s;
		margin-top: 0.25rem;
	}

	button:disabled { opacity: 0.5; cursor: not-allowed; }

	.error { font-size: 0.75rem; color: #ef4444; margin: 0; }

	.link { font-size: 0.75rem; color: #6b7280; text-align: center; margin: 0; }
	.link a { color: #22c55e; text-decoration: none; }
</style>

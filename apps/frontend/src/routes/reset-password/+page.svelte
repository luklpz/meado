<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/auth.js';

	let password = $state('');
	let password2 = $state('');
	let error = $state('');
	let loading = $state(false);

	const token = $derived($page.url.searchParams.get('token') ?? '');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (password !== password2) { error = 'Las contraseñas no coinciden.'; return; }
		if (password.length < 8) { error = 'La contraseña debe tener al menos 8 caracteres.'; return; }
		if (!token) { error = 'Enlace inválido.'; return; }

		loading = true;
		try {
			await authStore.resetPassword(token, password);
			goto('/login?reset=1');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al restablecer la contraseña.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Nueva contraseña</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>

		{#if !token}
			<div class="notice notice--err">Enlace inválido o expirado.</div>
			<a href="/forgot-password" class="back-link">Solicitar nuevo enlace</a>
		{:else}
			<p class="subtitle">Introduce tu nueva contraseña.</p>

			<form onsubmit={handleSubmit}>
				<label>
					<span>Nueva contraseña</span>
					<input type="password" bind:value={password} autocomplete="new-password" required minlength="8" />
				</label>
				<label>
					<span>Confirmar contraseña</span>
					<input type="password" bind:value={password2} autocomplete="new-password" required minlength="8" />
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button type="submit" disabled={loading}>
					{loading ? 'Guardando…' : 'Guardar contraseña'}
				</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		width: 100%;
		max-width: 340px;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--accent);
		text-align: center;
	}

	.subtitle {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.notice {
		font-size: 0.78rem;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius);
		line-height: 1.5;
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

	.back-link {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-align: center;
		display: block;
		transition: color var(--transition);
	}

	.back-link:hover { color: var(--accent); text-decoration: none; }
</style>

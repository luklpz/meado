<script lang="ts">
	import { authStore } from '$lib/auth.js';

	let email = $state('');
	let error = $state('');
	let success = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		success = '';
		loading = true;
		try {
			const res = await authStore.forgotPassword(email);
			success = res.message;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al enviar el email.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Recuperar contraseña</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>
		<p class="subtitle">Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.</p>

		{#if success}
			<div class="notice notice--ok">{success}</div>
			<a href="/login" class="back-link">Volver al inicio de sesión</a>
		{:else}
			<form onsubmit={handleSubmit}>
				<label>
					<span>Email</span>
					<input type="email" bind:value={email} autocomplete="email" required />
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button type="submit" disabled={loading}>
					{loading ? 'Enviando…' : 'Enviar enlace'}
				</button>
			</form>

			<a href="/login" class="back-link">Volver al inicio de sesión</a>
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
		line-height: 1.55;
	}

	.notice {
		font-size: 0.78rem;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius);
		line-height: 1.5;
	}

	.notice--ok {
		background: var(--success-surface);
		border: 1px solid var(--success-border);
		color: var(--success);
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

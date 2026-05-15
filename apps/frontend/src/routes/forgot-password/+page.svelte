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
			error = err instanceof Error ? err.message : 'Error al enviar el email';
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
		{:else}
			<form onsubmit={handleSubmit}>
				<label>
					<span>email</span>
					<input type="email" bind:value={email} autocomplete="email" required />
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button type="submit" disabled={loading}>
					{loading ? 'enviando…' : 'enviar enlace'}
				</button>
			</form>
		{/if}

		<p class="link"><a href="/login">volver al login</a></p>
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

	.subtitle {
		font-size: 0.78rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.5;
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

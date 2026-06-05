<script lang="ts">
	import { page } from '$app/stores';
	import { authStore } from '$lib/auth.js';

	let email = $state($page.url.searchParams.get('email') ?? '');
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

<div class="auth-wrap">
	<div class="auth-card">
		<div class="auth-logo">
			<div class="auth-mark">m</div>
			<div class="auth-name">meado</div>
		</div>
		<p class="auth-tag">Introduce tu email y te enviamos un enlace para restablecer tu contraseña.</p>

		{#if success}
			<div class="notice notice--ok">{success}</div>
			<a href="/login" class="auth-back">Volver al inicio de sesión</a>
		{:else}
			<form class="auth-form" onsubmit={handleSubmit}>
				<label class="field">
					<span>Email</span>
					<input class="input" type="email" bind:value={email} autocomplete="email" required placeholder="hola@meado.es" />
				</label>

				{#if error}
					<p class="field-error">{error}</p>
				{/if}

				<button class="btn block" type="submit" disabled={loading}>
					{loading ? 'Enviando…' : 'Enviar enlace'}
				</button>
			</form>

			<div class="auth-links">
				<a href="/login">Volver al inicio de sesión</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.auth-wrap {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: var(--bg-base);
	}

	.auth-wrap::before {
		content: '';
		position: fixed;
		inset: 0;
		background: var(--auth-glow);
		pointer-events: none;
	}

	.auth-card {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 380px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-card);
		padding: 2.5rem 2.1rem;
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}

	.auth-logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}

	.auth-mark {
		width: 60px;
		height: 60px;
		border-radius: var(--radius-lg);
		display: grid;
		place-items: center;
		background: linear-gradient(145deg, var(--accent), var(--accent-strong));
		color: var(--accent-text);
		font-family: var(--font-mono);
		font-weight: 800;
		font-size: 2rem;
		box-shadow: 0 10px 28px -8px var(--accent);
	}

	.auth-name {
		font-family: var(--font-mono);
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--text-primary);
		text-transform: lowercase;
	}

	.auth-tag {
		font-size: 0.82rem;
		color: var(--text-muted);
		text-align: center;
		margin-top: -0.6rem;
		line-height: 1.5;
	}

	.notice {
		display: flex;
		align-items: flex-start;
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

	.auth-form { display: flex; flex-direction: column; gap: 0.9rem; }

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.field > span {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-secondary);
	}

	.input {
		font-size: 0.9rem;
		padding: 0.7rem 0.85rem;
		background: var(--bg-elevated);
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		outline: none;
		transition: border-color var(--transition), box-shadow var(--transition);
		width: 100%;
	}

	.input::placeholder { color: var(--text-muted); }
	.input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-dim); }

	.field-error { font-size: 0.78rem; color: var(--error); }

	.btn {
		font-size: 0.88rem;
		font-weight: 800;
		padding: 0.75rem 1rem;
		border: none;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--accent-text);
		transition: transform var(--transition) var(--ease-bounce), filter var(--transition);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.btn:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
	.btn:active { transform: translateY(0) scale(0.98); }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
	.btn.block { width: 100%; }

	.auth-links {
		display: flex;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.auth-links a, .auth-back {
		color: var(--text-muted);
		transition: color var(--transition);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.auth-links a:hover, .auth-back:hover { color: var(--accent); }
</style>

<script lang="ts">
	import { authStore } from '$lib/auth.js';

	const USERNAME_RE = /^[a-zA-Z0-9]+$/;

	let username = $state('');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let password2 = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	let usernameError = $derived(
		username.length > 0 && !USERNAME_RE.test(username)
			? 'Solo letras y números'
			: ''
	);

	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!USERNAME_RE.test(username)) { error = 'El username solo puede contener letras y números.'; return; }
		if (username.length < 3) { error = 'El username debe tener al menos 3 caracteres.'; return; }
		if (password !== password2) { error = 'Las contraseñas no coinciden.'; return; }
		loading = true;
		try {
			await authStore.register(username, email, password, name || undefined);
			success = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al registrarse.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Crear cuenta</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>

		{#if success}
			<div class="success-box">
				<p class="success-title">¡Cuenta creada!</p>
				<p class="success-body">
					Te hemos enviado un email de verificación a <strong>{email}</strong>.
					Haz clic en el enlace para activar tu cuenta.
				</p>
				<a href="/login" class="btn-primary">Ir al inicio de sesión</a>
			</div>
		{:else}
			<form onsubmit={handleRegister}>
				<label>
					<span class="label-row">
						Username
						<span class="label-hint">identificador único · solo letras y números</span>
					</span>
					<input type="text" bind:value={username} autocomplete="username"
						required minlength="3" maxlength="32"
						class:input-error={usernameError} />
					{#if usernameError}<span class="field-error">{usernameError}</span>{/if}
				</label>
				<label>
					<span class="label-row">
						Nombre visible
						<span class="label-hint">opcional · lo que ven los demás</span>
					</span>
					<input type="text" bind:value={name} autocomplete="name" maxlength="64"
						placeholder="Igual que username si se deja vacío" />
				</label>
				<label>
					<span>Email</span>
					<input type="email" bind:value={email} autocomplete="email" required />
				</label>
				<label>
					<span>Contraseña</span>
					<input type="password" bind:value={password}
						autocomplete="new-password" required minlength="6" />
				</label>
				<label>
					<span>Repetir contraseña</span>
					<input type="password" bind:value={password2}
						autocomplete="new-password" required />
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button type="submit" disabled={loading || !!usernameError}>
					{loading ? 'Creando cuenta…' : 'Crear cuenta'}
				</button>
			</form>

			<p class="link">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>
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
		max-width: 380px;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--accent);
		text-align: center;
	}

	form { display: flex; flex-direction: column; gap: 0.75rem; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.label-row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.label-hint {
		font-size: 0.65rem;
		color: var(--text-muted);
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
	input.input-error { border-color: var(--error); }
	input::placeholder { color: var(--text-muted); font-size: 0.75rem; }

	.field-error { font-size: 0.68rem; color: var(--error); margin-top: -0.1rem; }

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

	.link { font-size: 0.75rem; color: var(--text-muted); text-align: center; }
	.link a { color: var(--accent); }

	.success-box {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--success-border);
		border-radius: var(--radius);
		background: var(--success-surface);
	}

	.success-title {
		font-size: 0.9rem;
		color: var(--success);
		font-weight: 700;
	}

	.success-body {
		font-size: 0.8rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.success-body strong { color: var(--text-primary); }

	.btn-primary {
		display: block;
		text-align: center;
		font-size: 0.82rem;
		padding: 0.5rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 700;
		transition: opacity var(--transition);
	}

	.btn-primary:hover { opacity: 0.88; text-decoration: none; }
</style>

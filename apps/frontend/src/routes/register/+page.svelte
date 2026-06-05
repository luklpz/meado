<script lang="ts">
	import { authStore } from '$lib/auth.js';

	const USERNAME_RE = /^[a-zA-Z0-9]+$/;

	let username  = $state('');
	let name      = $state('');
	let email     = $state('');
	let password  = $state('');
	let password2 = $state('');
	let tos       = $state(false);
	let error     = $state('');
	let loading   = $state(false);
	let success   = $state(false);

	let usernameError = $derived(
		username.length > 0 && !USERNAME_RE.test(username)
			? 'Solo letras y números'
			: ''
	);

	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!USERNAME_RE.test(username)) { error = 'El username solo puede contener letras y números.'; return; }
		if (username.length < 3)         { error = 'El username debe tener al menos 3 caracteres.'; return; }
		if (password !== password2)      { error = 'Las contraseñas no coinciden.'; return; }
		if (!tos)                        { error = 'Debes aceptar los términos para continuar.'; return; }
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

<div class="auth-wrap">
	<div class="auth-card">
		<div class="auth-logo">
			<div class="auth-mark">m</div>
			<div class="auth-name">meado</div>
		</div>
		<p class="auth-tag">Crea tu cuenta y empieza a estar cerca.</p>

		{#if success}
			<div class="success-box">
				<p class="success-title">¡Cuenta creada!</p>
				<p class="success-body">
					Te hemos enviado un email de verificación a <strong>{email}</strong>.
					Haz clic en el enlace para activar tu cuenta.
				</p>
				<a href="/login" class="btn block">Ir al inicio de sesión</a>
			</div>
		{:else}
			<form class="auth-form" onsubmit={handleRegister}>
				<label class="field">
					<span>Nombre para mostrar</span>
					<input class="input" type="text" bind:value={name} autocomplete="name" maxlength="64"
						placeholder="¿Cómo te llamamos?" />
				</label>

				<div class="field-row">
					<label class="field">
						<span>Usuario <span class="field-hint">· solo letras y números</span></span>
						<input class="input" type="text" bind:value={username} autocomplete="username"
							required minlength="3" maxlength="20" placeholder="username"
							class:input-error={usernameError} />
						{#if usernameError}<span class="field-err">{usernameError}</span>{/if}
					</label>
					<label class="field">
						<span>Email</span>
						<input class="input" type="email" bind:value={email} autocomplete="email" required
							placeholder="hola@meado.es" />
					</label>
				</div>

				<label class="field">
					<span>Contraseña</span>
					<input class="input" type="password" bind:value={password}
						autocomplete="new-password" required minlength="8" placeholder="••••••••" />
				</label>
				<label class="field">
					<span>Repetir contraseña</span>
					<input class="input" type="password" bind:value={password2}
						autocomplete="new-password" required placeholder="••••••••" />
				</label>

				<label class="check-row">
					<input type="checkbox" class="check" bind:checked={tos} />
					<span>Acepto los <a href="#">términos</a> y la <a href="#">privacidad</a>.</span>
				</label>

				{#if error}
					<p class="field-error">{error}</p>
				{/if}

				<button class="btn block" type="submit" disabled={loading || !!usernameError}>
					{loading ? 'Creando cuenta…' : 'Crear cuenta'}
				</button>
			</form>

			<div class="auth-foot">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></div>
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
		overflow-y: auto;
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
		max-width: 440px;
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

	.field-hint { color: var(--text-muted); font-weight: 400; }

	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }

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
	.input.input-error { border-color: var(--error); }

	.field-err { font-size: 0.68rem; color: var(--error); margin-top: -0.1rem; }
	.field-error { font-size: 0.78rem; color: var(--error); }

	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		font-size: 0.78rem;
		color: var(--text-secondary);
		line-height: 1.4;
		cursor: pointer;
	}

	.check {
		appearance: none;
		width: 18px;
		height: 18px;
		border: 1.5px solid var(--border-strong);
		border-radius: 5px;
		background: var(--bg-elevated);
		flex-shrink: 0;
		margin-top: 1px;
		position: relative;
		transition: all var(--transition);
		cursor: pointer;
	}

	.check:checked { background: var(--accent); border-color: var(--accent); }
	.check:checked::after {
		content: '';
		position: absolute;
		left: 5px; top: 1.5px;
		width: 5px; height: 9px;
		border: solid var(--accent-text);
		border-width: 0 2px 2px 0;
		transform: rotate(42deg);
	}

	.check-row a { color: var(--accent); font-weight: 700; }

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
		text-decoration: none;
	}

	.btn:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); text-decoration: none; }
	.btn:active { transform: translateY(0) scale(0.98); }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
	.btn.block { width: 100%; }

	.auth-foot {
		text-align: center;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.auth-foot a { color: var(--accent); font-weight: 700; }

	/* Success state */
	.success-box {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--success-border);
		border-radius: var(--radius);
		background: var(--success-surface);
	}

	.success-title { font-size: 0.9rem; color: var(--success); font-weight: 700; }

	.success-body {
		font-size: 0.8rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.success-body strong { color: var(--text-primary); }
</style>

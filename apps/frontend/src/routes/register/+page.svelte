<script lang="ts">
	import { authStore } from '$lib/auth.js';

	let username = $state('');
	let email = $state('');
	let password = $state('');
	let password2 = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (password !== password2) { error = 'Las contraseñas no coinciden'; return; }
		loading = true;
		try {
			await authStore.register(username, email, password);
			success = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al registrarse';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Meado — Registro</title></svelte:head>

<div class="page">
	<div class="card">
		<h1 class="logo">meado</h1>

		{#if success}
			<div class="success-box">
				<p class="success-title">¡Cuenta creada!</p>
				<p class="success-body">
					Te hemos enviado un email de verificación a <strong>{email}</strong>.
					Haz clic en el enlace del email para activar tu cuenta.
				</p>
				<a href="/login" class="btn-primary">ir al login</a>
			</div>
		{:else}
			<form onsubmit={handleRegister}>
				<label>
					<span>usuario</span>
					<input type="text" bind:value={username} autocomplete="username"
						required minlength="3" maxlength="24" />
				</label>
				<label>
					<span>email</span>
					<input type="email" bind:value={email} autocomplete="email" required />
				</label>
				<label>
					<span>contraseña</span>
					<input type="password" bind:value={password}
						autocomplete="new-password" required minlength="6" />
				</label>
				<label>
					<span>repetir contraseña</span>
					<input type="password" bind:value={password2}
						autocomplete="new-password" required />
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button type="submit" disabled={loading}>
					{loading ? 'registrando…' : 'crear cuenta'}
				</button>
			</form>

			<p class="link">¿Ya tienes cuenta? <a href="/login">iniciar sesión</a></p>
		{/if}
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
		width: 340px;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: #22c55e;
		text-align: center;
		margin: 0;
	}

	.hint { font-size: 0.7rem; color: #6b7280; text-align: center; margin: 0; }

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

	.success-box {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #22c55e44;
		border-radius: 4px;
		background: #0a1a0f;
	}

	.success-title {
		font-size: 0.9rem;
		color: #22c55e;
		font-weight: 700;
		margin: 0;
	}

	.success-body {
		font-size: 0.8rem;
		color: #9ca3af;
		margin: 0;
		line-height: 1.5;
	}

	.success-body strong { color: #d1fae5; }

	.btn-primary {
		display: inline-block;
		text-align: center;
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.45rem;
		background: #22c55e;
		color: #050d07;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-weight: 700;
		text-decoration: none;
	}
</style>

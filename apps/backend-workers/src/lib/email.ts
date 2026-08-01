import { Resend } from 'resend';
import type { Env } from '../env.js';

function emailShell(title: string, username: string, linkLabel: string, link: string, expiry: string): string {
	return `
		<!DOCTYPE html>
		<html>
		<body style="margin:0;padding:0;background:#050d07;font-family:monospace;">
			<div style="max-width:480px;margin:40px auto;padding:2rem;background:#080f0a;border:1px solid #1a3320;border-radius:8px;">
				<h1 style="margin:0 0 1.5rem;font-size:1.5rem;font-weight:700;letter-spacing:0.2em;color:#22c55e;">meado</h1>
				<p style="color:#d1fae5;margin:0 0 0.5rem;">Hola <strong>${username}</strong>,</p>
				<p style="color:#9ca3af;margin:0 0 1.5rem;font-size:0.9rem;">${title}</p>
				<a href="${link}" style="display:inline-block;padding:0.65rem 1.4rem;background:#22c55e;color:#050d07;text-decoration:none;border-radius:4px;font-weight:700;font-size:0.9rem;">${linkLabel}</a>
				<p style="color:#374151;font-size:0.75rem;margin:1.5rem 0 0;">El enlace expira en ${expiry}. Si no fuiste tú, ignora este email.</p>
			</div>
		</body>
		</html>
	`;
}

export async function sendVerificationEmail(env: Env, email: string, username: string, token: string): Promise<void> {
	const resend = new Resend(env.RESEND_API_KEY);
	const link = `${env.FRONTEND_URL}/api/auth/verify-email?token=${token}`;
	const { error } = await resend.emails.send({
		from: env.RESEND_FROM,
		to: email,
		subject: 'Verifica tu cuenta en Meado',
		html: emailShell('Haz clic en el botón para verificar tu cuenta:', username, 'Verificar cuenta', link, '24 horas'),
	});
	if (error) throw new Error(`Email delivery failed: ${error.message}`);
}

export async function sendPasswordResetEmail(env: Env, email: string, username: string, token: string): Promise<void> {
	const resend = new Resend(env.RESEND_API_KEY);
	const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
	const { error } = await resend.emails.send({
		from: env.RESEND_FROM,
		to: email,
		subject: 'Restablecer contraseña — Meado',
		html: emailShell('Haz clic en el botón para restablecer tu contraseña:', username, 'Restablecer contraseña', link, '1 hora'),
	});
	if (error) throw new Error(`Email delivery failed: ${error.message}`);
}

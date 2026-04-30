import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly from = process.env.RESEND_FROM ?? 'noreply@meado.es';
  private readonly frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  async sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/api/auth/verify-email?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Verifica tu cuenta en Meado',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#050d07;font-family:monospace;">
          <div style="max-width:480px;margin:40px auto;padding:2rem;background:#080f0a;border:1px solid #1a3320;border-radius:8px;">
            <h1 style="margin:0 0 1.5rem;font-size:1.5rem;font-weight:700;letter-spacing:0.2em;color:#22c55e;">
              meado
            </h1>
            <p style="color:#d1fae5;margin:0 0 0.5rem;">
              Hola <strong>${username}</strong>,
            </p>
            <p style="color:#9ca3af;margin:0 0 1.5rem;font-size:0.9rem;">
              Haz clic en el botón para verificar tu cuenta:
            </p>
            <a href="${link}"
               style="display:inline-block;padding:0.65rem 1.4rem;background:#22c55e;color:#050d07;text-decoration:none;border-radius:4px;font-weight:700;font-size:0.9rem;">
              Verificar cuenta
            </a>
            <p style="color:#374151;font-size:0.75rem;margin:1.5rem 0 0;">
              El enlace expira en 24 horas. Si no creaste esta cuenta, ignora este email.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      this.logger.error(`Failed to send verification email to ${email}: ${error.message}`);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}

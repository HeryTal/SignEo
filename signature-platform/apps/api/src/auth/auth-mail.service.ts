import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  private get configured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM); }

  async sendPasswordReset(to: string, name: string, resetUrl: string) {
    if (!this.configured) {
      this.logger.warn(`SMTP non configuré : réinitialisation non envoyée à ${to}.`);
      return { delivered: false };
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Réinitialisez votre mot de passe Signeo.it',
      text: `Bonjour ${name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${resetUrl}\n\nCe lien expire dans une heure. Si vous n’avez pas demandé cette action, ignorez cet e-mail.`,
    });
    return { delivered: true };
  }
}

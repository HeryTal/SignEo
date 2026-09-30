import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

type InvitationMail = { to: string; recipientName: string; envelopeTitle: string; signingUrl: string; expiresAt?: Date | null };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private get configured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  }

  async sendInvitation(mail: InvitationMail) {
    if (!this.configured) {
      this.logger.warn(`SMTP non configuré : invitation non envoyée à ${mail.to}.`);
      return { delivered: false, reason: 'SMTP_NOT_CONFIGURED' as const };
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: mail.to,
      subject: `Signature demandée — ${mail.envelopeTitle}`,
      text: `Bonjour ${mail.recipientName},\n\nVous êtes invité(e) à consulter et signer « ${mail.envelopeTitle} ».\n\nOuvrir le dossier : ${mail.signingUrl}${mail.expiresAt ? `\n\nExpiration : ${mail.expiresAt.toLocaleDateString('fr-FR')}` : ''}`,
    });
    return { delivered: true };
  }

  async sendCompletionNotice(to: string, envelopeTitle: string) {
    if (!this.configured) return { delivered: false, reason: 'SMTP_NOT_CONFIGURED' as const };
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
    await transport.sendMail({ from: process.env.SMTP_FROM, to, subject: `Dossier terminé — ${envelopeTitle}`, text: `Tous les destinataires ont traité « ${envelopeTitle} ». Vous pouvez télécharger les documents signés et le journal de preuve dans Signeo.` });
    return { delivered: true };
  }
}

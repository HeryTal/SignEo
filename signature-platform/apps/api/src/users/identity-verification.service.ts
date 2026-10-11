import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentityVerification, type IdentityVerificationStatus } from './identity-verification.entity.js';
import { User } from './user.entity.js';

@Injectable()
export class IdentityVerificationService {
  constructor(
    @InjectRepository(IdentityVerification) private readonly verifications: Repository<IdentityVerification>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async status(userId: string) {
    let verification = await this.verifications.findOne({ where: { user: { id: userId } } });
    if (verification?.provider === 'stripe' && verification.providerReference && verification.status === 'PENDING') {
      verification = await this.refreshStripeVerification(verification);
    }
    return this.dto(verification);
  }

  async start(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const provider = process.env.IDENTITY_VERIFICATION_PROVIDER?.trim();
    if (provider?.toLowerCase() === 'stripe') return this.startStripe(user);
    const providerUrl = process.env.IDENTITY_VERIFICATION_URL?.trim();
    if (!provider || !providerUrl) {
      throw new BadRequestException('La vérification d’identité n’est pas configurée pour cette instance.');
    }
    const reference = randomUUID();
    let verification = await this.verifications.findOne({ where: { user: { id: userId } } });
    if (!verification) verification = this.verifications.create({ user });
    verification.status = 'PENDING'; verification.provider = provider.slice(0, 80); verification.providerReference = reference;
    verification.verifiedAt = null; verification.rejectionReason = null;
    await this.verifications.save(verification);
    const url = new URL(providerUrl); url.searchParams.set('reference', reference);
    return { ...this.dto(verification), verificationUrl: url.toString() };
  }

  private async startStripe(user: User) {
    const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!apiKey) throw new BadRequestException('STRIPE_SECRET_KEY est requis pour Stripe Identity.');

    const response = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ type: 'document', 'metadata[user_id]': user.id }),
    });
    const session = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !session.id || !session.url) {
      throw new BadRequestException(session.error?.message || 'Impossible de créer la vérification Stripe.');
    }

    let verification = await this.verifications.findOne({ where: { user: { id: user.id } } });
    if (!verification) verification = this.verifications.create({ user });
    verification.status = 'PENDING'; verification.provider = 'stripe'; verification.providerReference = session.id;
    verification.verifiedAt = null; verification.rejectionReason = null;
    await this.verifications.save(verification);
    return { ...this.dto(verification), verificationUrl: session.url };
  }

  async providerCallback(secret: string | undefined, reference: string, status: IdentityVerificationStatus, reason?: string) {
    const expected = process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET;
    if (!expected || !secret || expected.length !== secret.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(secret))) {
      throw new UnauthorizedException('Signature de vérification invalide.');
    }
    if (!['VERIFIED', 'REJECTED'].includes(status)) throw new BadRequestException('Statut de vérification invalide.');
    const verification = await this.verifications.findOne({ where: { providerReference: reference } });
    if (!verification) throw new NotFoundException('Vérification introuvable.');
    verification.status = status; verification.verifiedAt = status === 'VERIFIED' ? new Date() : null;
    verification.rejectionReason = status === 'REJECTED' ? (reason?.slice(0, 500) || 'Vérification refusée par le prestataire.') : null;
    await this.verifications.save(verification);
    return this.dto(verification);
  }

  async stripeWebhook(signature: string | undefined, rawBody: Buffer | undefined) {
    const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    if (!secret || !signature || !rawBody || !this.isValidStripeSignature(signature, rawBody, secret)) {
      throw new UnauthorizedException('Signature Stripe invalide.');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as { type?: string; data?: { object?: { id?: string; last_error?: { reason?: string } } } };
    const reference = event.data?.object?.id;
    if (!reference) return { received: true };
    if (event.type === 'identity.verification_session.verified') {
      await this.updateStripeVerification(reference, 'VERIFIED');
    } else if (event.type === 'identity.verification_session.requires_input' || event.type === 'identity.verification_session.canceled') {
      await this.updateStripeVerification(reference, 'REJECTED', event.data?.object?.last_error?.reason);
    }
    return { received: true };
  }

  private isValidStripeSignature(signature: string, rawBody: Buffer, secret: string) {
    const pieces = signature.split(',').map((part) => part.split('='));
    const timestamp = pieces.find(([key]) => key === 't')?.[1];
    const candidates = pieces.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean) as string[];
    if (!timestamp || !candidates.length) return false;
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    return candidates.some((candidate) => candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)));
  }

  private async updateStripeVerification(reference: string, status: Extract<IdentityVerificationStatus, 'VERIFIED' | 'REJECTED'>, reason?: string) {
    const verification = await this.verifications.findOne({ where: { provider: 'stripe', providerReference: reference } });
    if (!verification) return;
    verification.status = status;
    verification.verifiedAt = status === 'VERIFIED' ? new Date() : null;
    verification.rejectionReason = status === 'REJECTED' ? (reason?.slice(0, 500) || 'Vérification refusée par Stripe.') : null;
    await this.verifications.save(verification);
  }

  private async refreshStripeVerification(verification: IdentityVerification) {
    const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!apiKey || !verification.providerReference) return verification;
    const response = await fetch(`https://api.stripe.com/v1/identity/verification_sessions/${encodeURIComponent(verification.providerReference)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
    });
    if (!response.ok) return verification;
    const session = await response.json() as { status?: string; last_error?: { reason?: string } };
    if (session.status === 'verified') {
      verification.status = 'VERIFIED'; verification.verifiedAt = new Date(); verification.rejectionReason = null;
      return this.verifications.save(verification);
    }
    if (session.status === 'canceled') {
      verification.status = 'REJECTED'; verification.verifiedAt = null;
      verification.rejectionReason = session.last_error?.reason || 'Vérification annulée par Stripe.';
      return this.verifications.save(verification);
    }
    return verification;
  }

  private dto(verification?: IdentityVerification | null) {
    return { status: verification?.status ?? 'NOT_STARTED', provider: verification?.provider ?? null, verifiedAt: verification?.verifiedAt ?? null, rejectionReason: verification?.rejectionReason ?? null };
  }
}

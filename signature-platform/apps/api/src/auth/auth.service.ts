import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { User, type UserBranding } from '../users/user.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { IdentityVerificationService } from '../users/identity-verification.service.js';

@Injectable()
export class AuthService {
  private readonly googleLoginCodes = new Map<string, { token: ReturnType<AuthService['issueToken']>; expiresAt: number }>();
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly workspaces: WorkspacesService,
    private readonly mail: AuthMailService,
    private readonly identity: IdentityVerificationService,
  ) {}

  async signup(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.users.findOne({ where: { email: normalizedEmail } });
    if (existingUser) throw new ConflictException('Cette adresse e-mail est déjà utilisée.');

    const user = this.users.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await hash(password, 12),
    });
    await this.users.save(user);
    await this.workspaces.createPersonalWorkspace(user);
    return this.issueToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    }
    return this.issueToken(user);
  }

  async requestPasswordReset(email: string, webOrigin: string) {
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    // Deliberately identical response: this endpoint must not reveal registered addresses.
    if (!user) return { accepted: true };
    const token = randomBytes(32).toString('base64url');
    user.passwordResetTokenHash = createHash('sha256').update(token).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.users.save(user);
    await this.mail.sendPasswordReset(user.email, user.name, `${webOrigin}/connexion?reset=${encodeURIComponent(token)}`);
    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.users.findOne({ where: { passwordResetTokenHash: tokenHash } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Ce lien de réinitialisation est invalide ou expiré.');
    }
    user.passwordHash = await hash(password, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await this.users.save(user);
    return { reset: true };
  }

  async loginWithGoogle(name: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await this.users.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      user = this.users.create({
        name: name.trim().slice(0, 120) || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        // Google validates this identity. A random value makes password login unavailable
        // until a password-reset flow is implemented.
        passwordHash: await hash(randomBytes(32).toString('hex'), 12),
      });
      await this.users.save(user);
      await this.workspaces.createPersonalWorkspace(user);
    }

    return this.issueToken(user);
  }

  createGoogleLoginCode(token: ReturnType<AuthService['issueToken']>) {
    const code = randomBytes(32).toString('base64url');
    this.googleLoginCodes.set(code, { token, expiresAt: Date.now() + 60_000 });
    return code;
  }

  exchangeGoogleLoginCode(code: string) {
    const entry = this.googleLoginCodes.get(code);
    this.googleLoginCodes.delete(code);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Ce lien de connexion Google a expiré. Recommencez.');
    }
    return entry.token;
  }

  async getProfile(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');
    const workspace = await this.workspaces.profile(id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      branding: this.normalizeBranding(user.branding),
      identityVerification: await this.identity.status(user.id),
      ...workspace,
    };
  }

  async updateBranding(id: string, branding: UserBranding) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');
    user.branding = this.normalizeBranding(branding);
    await this.users.save(user);
    return { branding: user.branding };
  }

  private normalizeBranding(value?: Partial<UserBranding> | null): UserBranding {
    return {
      displayName: value?.displayName?.trim() || 'Signeo',
      accentColor: /^#[\da-f]{6}$/i.test(value?.accentColor ?? '')
        ? value!.accentColor!
        : '#496b50',
      logoUrl: value?.logoUrl?.trim() ?? '',
      textFont: ['SANS', 'SERIF', 'MONO'].includes(value?.textFont ?? '') ? value!.textFont! : 'SANS',
      signatureFont: ['SCRIPT', 'SERIF', 'SANS'].includes(value?.signatureFont ?? '') ? value!.signatureFont! : 'SCRIPT',
      textColor: /^#[\da-f]{6}$/i.test(value?.textColor ?? '') ? value!.textColor! : '#24352b',
      signatureColor: /^#[\da-f]{6}$/i.test(value?.signatureColor ?? '') ? value!.signatureColor! : '#315b45',
      textSize: Number.isInteger(value?.textSize) && value!.textSize! >= 8 && value!.textSize! <= 18 ? value!.textSize! : 11,
      signatureSize: Number.isInteger(value?.signatureSize) && value!.signatureSize! >= 14 && value!.signatureSize! <= 30 ? value!.signatureSize! : 22,
    };
  }

  private issueToken(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
}

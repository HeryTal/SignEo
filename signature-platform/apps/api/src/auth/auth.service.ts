import { BadRequestException, NotFoundException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { AuthSession } from './auth-session.entity.js';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { User, type UserBranding } from '../users/user.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { IdentityVerificationService } from '../users/identity-verification.service.js';

@Injectable()
export class AuthService {
  private readonly googleLoginCodes = new Map<string, { token: Awaited<ReturnType<AuthService['issueToken']>>; expiresAt: number }>();
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly workspaces: WorkspacesService,
    private readonly mail: AuthMailService,
    private readonly identity: IdentityVerificationService,
    private readonly db: DataSource,
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
    await this.db.transaction(async manager => {
      const changed = await manager.getRepository(User).createQueryBuilder().update().set({passwordHash:user.passwordHash,passwordResetTokenHash:null,passwordResetExpiresAt:null,authVersion:() => 'auth_version + 1'}).where('id = :id AND password_reset_token_hash = :token AND password_reset_expires_at > NOW()', {id:user.id,token:tokenHash}).execute();
      if (!changed.affected) throw new UnauthorizedException('Lien déjà utilisé ou expiré.');
      await manager.getRepository(AuthSession).update({userId:user.id,revokedAt:IsNull()},{revokedAt:new Date()});
    });
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

  createGoogleLoginCode(token: Awaited<ReturnType<AuthService['issueToken']>>) {
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

  async updateProfile(id: string, name: string) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw new BadRequestException('Nom requis (120 caractères maximum).');
    await this.users.update(id,{name:name.trim()});
    return this.getProfile(id);
  }
  async sessions(userId: string, current: string) {
    const sessions = await this.db.getRepository(AuthSession).find({where:{userId,revokedAt:IsNull(),expiresAt:MoreThan(new Date())},order:{createdAt:'DESC'}});
    return sessions.map(({id,label,createdAt,expiresAt}) => ({id,label,createdAt,expiresAt,current:id===current}));
  }
  async revokeSession(userId: string, id: string) {
    const result = await this.db.getRepository(AuthSession).update({id,userId,revokedAt:IsNull()},{revokedAt:new Date()});
    if (!result.affected) throw new NotFoundException('Session introuvable.');
    return {revoked:true};
  }
  async revokeOtherSessions(userId:string,current:string) {
    await this.db.getRepository(AuthSession).createQueryBuilder().update().set({revokedAt:new Date()}).where('"userId" = :userId AND id != :current AND "revokedAt" IS NULL',{userId,current}).execute();
    return {revoked:true};
  }
  async changePassword(userId:string,currentPassword:string,password:string) {
    const user = await this.users.findOneByOrFail({id:userId});
    if (!await compare(currentPassword,user.passwordHash)) throw new UnauthorizedException('Mot de passe actuel incorrect.');
    const passwordHash = await hash(password,12);
    await this.db.transaction(async manager => {
      const result = await manager.getRepository(User).createQueryBuilder().update().set({passwordHash,authVersion:()=>'auth_version + 1',passwordResetTokenHash:null,passwordResetExpiresAt:null}).where('id = :id AND password_hash = :old',{id:userId,old:user.passwordHash}).execute();
      if (!result.affected) throw new UnauthorizedException('Compte modifié. Reconnectez-vous.');
      await manager.getRepository(AuthSession).update({userId,revokedAt:IsNull()},{revokedAt:new Date()});
    });
    return {changed:true,reloginRequired:true};
  }

  private async issueToken(user: User) {
    return this.db.transaction(async manager => {
      const current = await manager.getRepository(User).findOne({where:{id:user.id},lock:{mode:'pessimistic_write'}});
      if (!current || current.authVersion !== user.authVersion) throw new UnauthorizedException('Reconnectez-vous.');
      const sessions = manager.getRepository(AuthSession);
      const session = await sessions.save(sessions.create({userId:user.id,label:'Navigateur web',expiresAt:new Date(Date.now()+7*24*3600*1000)}));
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, jti:session.id, version:current.authVersion }),
      user: { id: user.id, name: user.name, email: user.email },
    };
    });
  }
}

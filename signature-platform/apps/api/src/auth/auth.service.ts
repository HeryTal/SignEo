import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { hash, compare } from 'bcryptjs';
import { Repository } from 'typeorm';
import { User, type UserBranding } from '../users/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
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
    return this.issueToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    }
    return this.issueToken(user);
  }

  async getProfile(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      branding: this.normalizeBranding(user.branding),
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

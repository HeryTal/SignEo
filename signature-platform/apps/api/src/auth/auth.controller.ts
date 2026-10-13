import { AuthRateGuard } from './auth-rate.guard.js';
import { BadRequestException, Delete, Param, ParseUUIDPipe, Body, Controller, Get, Headers, Patch, Post, Query, Request, Req, Res, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { GoogleOAuthService } from './google-oauth.service.js';
import { IdentityVerificationService } from '../users/identity-verification.service.js';

type SignupBody = { name?: string; email?: string; password?: string };
type LoginBody = { email?: string; password?: string };
type PasswordResetBody = { email?: string };
type BrandingBody = { displayName?: string; accentColor?: string; logoUrl?: string; textFont?: 'SANS' | 'SERIF' | 'MONO'; signatureFont?: 'SCRIPT' | 'SERIF' | 'SANS'; textColor?: string; signatureColor?: string; textSize?: number; signatureSize?: number };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly google: GoogleOAuthService, private readonly identity: IdentityVerificationService) {}

  @Post('signup')
  @UseGuards(AuthRateGuard)
  signup(@Body() body: SignupBody) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 || typeof body.email !== 'string' || body.email.length > 255 || !/^\S+@\S+\.\S+$/.test(body.email.trim()) || typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password,'utf8') > 72) {
      throw new BadRequestException('Nom, e-mail valide et mot de passe de 12 caractères minimum (72 octets maximum) requis.');
    }
    return this.auth.signup(body.name, body.email, body.password);
  }

  @Post('login')
  @UseGuards(AuthRateGuard)
  login(@Body() body: LoginBody) {
    if (typeof body.email !== 'string' || !body.email.trim() || body.email.length > 255 || typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password,'utf8') > 72) {
      throw new BadRequestException('E-mail et mot de passe requis.');
    }
    return this.auth.login(body.email, body.password);
  }

  @Post('password-reset/request')
  @UseGuards(AuthRateGuard)
  requestPasswordReset(@Body() body: PasswordResetBody) {
    if (typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email.trim()) || body.email.length > 255) throw new BadRequestException('Adresse e-mail requise.');
    return this.auth.requestPasswordReset(body.email, process.env.WEB_ORIGIN ?? 'http://localhost:3000');
  }

  @Post('password-reset/confirm')
  @UseGuards(AuthRateGuard)
  confirmPasswordReset(@Body() body: { token?: string; password?: string }) {
    if (typeof body.token !== 'string' || !body.token || typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password,'utf8') > 72) {
      throw new BadRequestException('Un lien valide et un mot de passe de 12 caractères minimum (72 octets maximum) sont requis.');
    }
    return this.auth.resetPassword(body.token, body.password);
  }

  @Get('google')
  googleLogin(@Res() response: Response) {
    const { state, url } = this.google.begin();
    response.cookie('signeo_google_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/auth/google',
    });
    response.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Request() request: ExpressRequest,
    @Res() response: Response,
  ) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    response.clearCookie('signeo_google_oauth_state', { path: '/auth/google' });
    if (error || !code || !state) {
      return response.redirect(`${webOrigin}/connexion?google_error=cancelled`);
    }

    try {
      this.google.verifyState(state, this.readCookie(request, 'signeo_google_oauth_state'));
      const identity = await this.google.getIdentity(code);
      const token = await this.auth.loginWithGoogle(identity.name, identity.email);
      const loginCode = this.auth.createGoogleLoginCode(token);
      return response.redirect(`${webOrigin}/connexion?google_code=${encodeURIComponent(loginCode)}`);
    } catch {
      return response.redirect(`${webOrigin}/connexion?google_error=failed`);
    }
  }

  @Post('google/exchange')
  @UseGuards(AuthRateGuard)
  googleExchange(@Body() body: { code?: string }) {
    if (!body.code) throw new BadRequestException('Code de connexion Google requis.');
    return this.auth.exchangeGoogleLoginCode(body.code);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  profile(@Request() request: {user:{sub:string}}, @Body() body: {name?:string}) { return this.auth.updateProfile(request.user.sub,body.name ?? ''); }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@Request() request:{user:{sub:string;jti:string}}) { return this.auth.sessions(request.user.sub,request.user.jti); }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  revokeOthers(@Request() request:{user:{sub:string;jti:string}}) { return this.auth.revokeOtherSessions(request.user.sub,request.user.jti); }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@Request() request:{user:{sub:string}}, @Param('id',ParseUUIDPipe) id:string) { return this.auth.revokeSession(request.user.sub,id); }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Request() request:{user:{sub:string;jti:string}}) { return this.auth.revokeSession(request.user.sub,request.user.jti); }

  @Post('password')
  @UseGuards(JwtAuthGuard,AuthRateGuard)
  password(@Request() request:{user:{sub:string}},@Body() body:{currentPassword?:string;password?:string}) {
    if (typeof body.currentPassword !== 'string' || typeof body.password !== 'string' || body.password.length<12 || Buffer.byteLength(body.password,'utf8')>72) throw new BadRequestException('Mot de passe requis : 12 caractères minimum, 72 octets maximum.');
    return this.auth.changePassword(request.user.sub,body.currentPassword,body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() request: { user: { sub: string; email: string } }) {
    return this.auth.getProfile(request.user.sub);
  }

  @Get('identity-verification')
  @UseGuards(JwtAuthGuard)
  identityStatus(@Request() request: { user: { sub: string } }) { return this.identity.status(request.user.sub); }

  @Post('identity-verification')
  @UseGuards(JwtAuthGuard)
  startIdentityVerification(@Request() request: { user: { sub: string } }) { return this.identity.start(request.user.sub); }

  @Post('identity-verification/callback')
  identityCallback(
    @Headers('x-identity-signature') signature: string | undefined,
    @Body() body: { reference?: string; status?: 'VERIFIED' | 'REJECTED'; reason?: string },
  ) {
    if (!body.reference || !body.status) throw new BadRequestException('Référence et statut requis.');
    return this.identity.providerCallback(signature, body.reference, body.status, body.reason);
  }

  @Post('identity-verification/stripe-webhook')
  stripeIdentityWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: ExpressRequest & { rawBody?: Buffer },
  ) {
    return this.identity.stripeWebhook(signature, request.rawBody);
  }

  @Patch('branding')
  @UseGuards(JwtAuthGuard)
  updateBranding(
    @Request() request: { user: { sub: string } },
    @Body() body: BrandingBody,
  ) {
    const displayName = body.displayName?.trim() ?? '';
    const accentColor = body.accentColor?.trim() ?? '';
    const logoUrl = body.logoUrl?.trim() ?? '';
    if (
      !displayName ||
      displayName.length > 80 ||
      !/^#[\da-f]{6}$/i.test(accentColor) ||
      logoUrl.length > 1000 ||
      (logoUrl && !logoUrl.startsWith('https://'))
      || !['SANS', 'SERIF', 'MONO'].includes(body.textFont ?? '')
      || !['SCRIPT', 'SERIF', 'SANS'].includes(body.signatureFont ?? '')
      || !/^#[\da-f]{6}$/i.test(body.textColor ?? '')
      || !/^#[\da-f]{6}$/i.test(body.signatureColor ?? '')
      || !Number.isInteger(body.textSize) || body.textSize! < 8 || body.textSize! > 18
      || !Number.isInteger(body.signatureSize) || body.signatureSize! < 14 || body.signatureSize! > 30
    ) {
      throw new BadRequestException(
        'Vérifiez le nom, la couleur hexadécimale et l’URL HTTPS du logo.',
      );
    }
    return this.auth.updateBranding(request.user.sub, {
      displayName,
      accentColor,
      logoUrl,
      textFont: body.textFont!,
      signatureFont: body.signatureFont!,
      textColor: body.textColor!,
      signatureColor: body.signatureColor!,
      textSize: body.textSize!,
      signatureSize: body.signatureSize!,
    });
  }

  private readCookie(request: ExpressRequest, name: string) {
    const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return value?.slice(name.length + 1);
  }
}

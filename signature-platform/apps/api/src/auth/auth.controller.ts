import { BadRequestException, Body, Controller, Get, Headers, Patch, Post, Query, Request, Req, Res, UseGuards } from '@nestjs/common';
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
  signup(@Body() body: SignupBody) {
    if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 8) {
      throw new BadRequestException('Nom, e-mail et mot de passe de 8 caractères minimum requis.');
    }
    return this.auth.signup(body.name, body.email, body.password);
  }

  @Post('login')
  login(@Body() body: LoginBody) {
    if (!body.email?.trim() || !body.password) {
      throw new BadRequestException('E-mail et mot de passe requis.');
    }
    return this.auth.login(body.email, body.password);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetBody) {
    if (!body.email?.trim()) throw new BadRequestException('Adresse e-mail requise.');
    return this.auth.requestPasswordReset(body.email, process.env.WEB_ORIGIN ?? 'http://localhost:3000');
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: { token?: string; password?: string }) {
    if (!body.token || !body.password || body.password.length < 8) {
      throw new BadRequestException('Un lien valide et un mot de passe de 8 caractères minimum sont requis.');
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
  googleExchange(@Body() body: { code?: string }) {
    if (!body.code) throw new BadRequestException('Code de connexion Google requis.');
    return this.auth.exchangeGoogleLoginCode(body.code);
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

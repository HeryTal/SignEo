import { BadRequestException, Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

type SignupBody = { name?: string; email?: string; password?: string };
type LoginBody = { email?: string; password?: string };
type BrandingBody = { displayName?: string; accentColor?: string; logoUrl?: string; textFont?: 'SANS' | 'SERIF' | 'MONO'; signatureFont?: 'SCRIPT' | 'SERIF' | 'SANS'; textColor?: string; signatureColor?: string; textSize?: number; signatureSize?: number };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() request: { user: { sub: string; email: string } }) {
    return this.auth.getProfile(request.user.sub);
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
}

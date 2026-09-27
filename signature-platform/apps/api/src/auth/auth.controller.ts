import { BadRequestException, Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

type SignupBody = { name?: string; email?: string; password?: string };
type LoginBody = { email?: string; password?: string };

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
}

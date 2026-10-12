import { AuthSession } from './auth-session.entity.js';
import { AuthRateGuard } from './auth-rate.guard.js';
import { RateLimitService } from '../developer/rate-limit.service.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from '../users/user.entity.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { GoogleOAuthService } from './google-oauth.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { IdentityVerification } from '../users/identity-verification.entity.js';
import { IdentityVerificationService } from '../users/identity-verification.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, IdentityVerification, AuthSession]),
    WorkspacesModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local-development-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthRateGuard, RateLimitService, AuthService, GoogleOAuthService, AuthMailService, IdentityVerificationService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}

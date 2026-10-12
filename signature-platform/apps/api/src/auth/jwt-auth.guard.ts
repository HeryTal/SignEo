import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { AuthSession } from './auth-session.entity.js';
import { User } from '../users/user.entity.js';
@Injectable()
export class JwtAuthGuard implements CanActivate {
 constructor(private readonly jwt: JwtService, private readonly db: DataSource) {}
 async canActivate(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest();
  const authorization = request.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw new UnauthorizedException('Connexion requise.');
  try {
   const payload = await this.jwt.verifyAsync(token);
   if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') throw new Error('Invalid session');
   const session = await this.db.getRepository(AuthSession).findOneBy({id:payload.jti,userId:payload.sub,revokedAt:IsNull(),expiresAt:MoreThan(new Date())});
   const user = await this.db.getRepository(User).findOneBy({id:payload.sub});
   if (!session || !user || payload.version !== user.authVersion) throw new Error('Revoked session');
   request.user = payload;
   return true;
  } catch { throw new UnauthorizedException('Session expirée ou révoquée. Reconnectez-vous.'); }
 }
}

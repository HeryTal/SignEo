import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RateLimitService } from '../developer/rate-limit.service.js';
@Injectable()
export class AuthRateGuard implements CanActivate {
 constructor(private readonly limits: RateLimitService) {}
 async canActivate(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest();
  const response = context.switchToHttp().getResponse();
  // Never trust a caller-supplied forwarded IP. Express proxy trust is configured at deployment.
  const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  const key = createHash('sha256').update(String(ip)).digest('hex');
  const result = await this.limits.consume('auth-ip:' + key, 20);
  if (!result.allowed) { response.setHeader('Retry-After', Math.max(1,Math.ceil((result.resetAt-Date.now())/1000))); throw new HttpException('Trop de tentatives. Réessayez dans une minute.',429); }
  if (typeof request.body?.email === 'string') {
   const email = createHash('sha256').update(request.body.email.trim().toLowerCase()).digest('hex');
   if (!(await this.limits.consume('auth-email:' + email, 8)).allowed) { response.setHeader('Retry-After','60'); throw new HttpException('Trop de tentatives. Réessayez dans une minute.',429); }
  }
  return true;
 }
}

import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_SCOPES } from './api-scopes.decorator.js';
import { ApiKeyService } from './api-key.service.js';
import { RateLimitService } from './rate-limit.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService, private readonly reflector: Reflector, private readonly rateLimit: RateLimitService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; method: string; originalUrl?: string; url: string; apiKey?: unknown }>();
    const value = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const key = await this.keys.authenticate(value, request.method, request.originalUrl ?? request.url);
    const scopes = this.reflector.getAllAndOverride<string[]>(API_SCOPES, [context.getHandler(), context.getClass()]) ?? [];
    if (scopes.some((scope) => !key.scopes.includes(scope))) throw new ForbiddenException('Cette clé ne possède pas la permission requise.');
    const limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60);
    const result = await this.rateLimit.consume(key.id, limit);
    if (!result.allowed) throw new HttpException('Limite atteinte : 60 requêtes par minute.', HttpStatus.TOO_MANY_REQUESTS);
    context.switchToHttp().getResponse().setHeader('X-RateLimit-Limit', limit).setHeader('X-RateLimit-Remaining', result.remaining).setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    request.apiKey = key;
    return true;
  }
}

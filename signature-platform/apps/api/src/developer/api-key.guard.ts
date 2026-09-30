import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_SCOPES } from './api-scopes.decorator.js';
import { ApiKeyService } from './api-key.service.js';

const windows = new Map<string, number[]>();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; method: string; originalUrl?: string; url: string; apiKey?: unknown }>();
    const value = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const key = await this.keys.authenticate(value, request.method, request.originalUrl ?? request.url);
    const scopes = this.reflector.getAllAndOverride<string[]>(API_SCOPES, [context.getHandler(), context.getClass()]) ?? [];
    if (scopes.some((scope) => !key.scopes.includes(scope))) throw new ForbiddenException('Cette clé ne possède pas la permission requise.');
    const now = Date.now(); const recent = (windows.get(key.id) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= 60) throw new HttpException('Limite atteinte : 60 requêtes par minute.', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now); windows.set(key.id, recent); request.apiKey = key;
    return true;
  }
}

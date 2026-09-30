import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';

const windows = new Map<string, number[]>();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; method: string; originalUrl?: string; url: string; apiKey?: unknown }>();
    const value = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const key = await this.keys.authenticate(value, request.method, request.originalUrl ?? request.url);
    const now = Date.now(); const recent = (windows.get(key.id) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= 60) throw new HttpException('Limite atteinte : 60 requêtes par minute.', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now); windows.set(key.id, recent); request.apiKey = key;
    return true;
  }
}

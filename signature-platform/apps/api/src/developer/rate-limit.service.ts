import { ServiceUnavailableException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly fallback = new Map<string, number[]>();
  private readonly redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
    : null;

  async consume(key: string, limit: number) {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        const redisKey = `signeo:rate-limit:${key}`;
        const transaction = this.redis.multi();
        transaction.incr(redisKey);
        transaction.pexpire(redisKey, 60_000, 'NX');
        transaction.pttl(redisKey);
        const result = await transaction.exec();
        const count = Number(result?.[0]?.[1] ?? 0);
        const ttl = Number(result?.[2]?.[1] ?? 60_000);
        return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: Date.now() + Math.max(0, ttl) };
      } catch {
        if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Protection temporairement indisponible. Réessayez plus tard.');
      }
    }
    const now = Date.now();
    for (const [id,times] of this.fallback) if (!times.length || times[times.length-1]<now-60000) this.fallback.delete(id);
    const recent = (this.fallback.get(key) ?? []).filter((at) => at > now - 60_000);
    if (recent.length < limit + 1) recent.push(now); this.fallback.set(key, recent);
    return { allowed: recent.length <= limit, remaining: Math.max(0, limit - recent.length), resetAt: now + 60_000 };
  }

  async onModuleDestroy() { await this.redis?.quit().catch(() => undefined); }
}

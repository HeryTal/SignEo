import { isAbsolute } from 'node:path';
export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
 if (env.NODE_ENV !== 'production') return;
 const errors:string[] = [];
 for (const key of ['JWT_SECRET','WEBHOOK_ENCRYPTION_SECRET']) if (!env[key] || env[key]!.length < 32 || /local-development|change.me/i.test(env[key]!)) errors.push(key + ' must be an independent secret of at least 32 characters');
 for (const key of ['DATABASE_PASSWORD','SMTP_HOST','SMTP_FROM','REDIS_URL']) if (!env[key]) errors.push(key + ' is required');
 if (!env.WEB_ORIGIN?.startsWith('https://')) errors.push('WEB_ORIGIN must use HTTPS');
 if (!env.UPLOAD_DIRECTORY || !isAbsolute(env.UPLOAD_DIRECTORY)) errors.push('UPLOAD_DIRECTORY must be an absolute persistent volume path');
 if (env.WEBHOOK_ENCRYPTION_SECRET === env.JWT_SECRET) errors.push('Webhook and JWT secrets must differ');
 if (errors.length) throw new Error('Production configuration invalid: '+errors.join('; '));
}

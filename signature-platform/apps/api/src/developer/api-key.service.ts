import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { ApiKey, type ApiKeyEnvironment } from './api-key.entity.js';
import { ApiRequestLog } from './api-request-log.entity.js';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey) private readonly keys: Repository<ApiKey>,
    @InjectRepository(ApiRequestLog) private readonly logs: Repository<ApiRequestLog>,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(userId: string) {
    const membership = await this.workspaces.activeForUser(userId);
    const keys = await this.keys.find({ where: { workspace: { id: membership.workspace.id } }, order: { createdAt: 'DESC' } });
    return keys.map((key) => this.dto(key));
  }

  async create(userId: string, name: string, environment: ApiKeyEnvironment) {
    const membership = await this.workspaces.activeForUser(userId);
    this.workspaces.requireAdmin(membership.role);
    if (!name.trim() || name.trim().length > 80) throw new BadRequestException('Donnez un nom de 1 à 80 caractères à cette clé.');
    if (!['SANDBOX', 'PRODUCTION'].includes(environment)) throw new BadRequestException('Environnement invalide.');
    const secret = `signeo_${environment.toLowerCase()}_${randomBytes(32).toString('base64url')}`;
    const key = await this.keys.save(this.keys.create({ name: name.trim(), environment, prefix: secret.slice(0, 22), secretHash: this.hash(secret), workspace: membership.workspace }));
    return { ...this.dto(key), secret };
  }

  async revoke(userId: string, keyId: string) {
    const membership = await this.workspaces.activeForUser(userId);
    this.workspaces.requireAdmin(membership.role);
    const key = await this.keys.findOne({ where: { id: keyId, workspace: { id: membership.workspace.id } } });
    if (!key) throw new NotFoundException('Clé API introuvable.');
    key.revokedAt = new Date();
    await this.keys.save(key);
    return this.dto(key);
  }

  async authenticate(secret: string | undefined, method: string, path: string) {
    if (!secret?.startsWith('signeo_')) throw new UnauthorizedException('Clé API manquante ou invalide.');
    const key = await this.keys.findOne({ where: { secretHash: this.hash(secret), revokedAt: IsNull() }, relations: { workspace: true } });
    if (!key) throw new UnauthorizedException('Clé API manquante, invalide ou révoquée.');
    key.lastUsedAt = new Date();
    await this.keys.save(key);
    await this.logs.save(this.logs.create({ apiKey: key, method: method.slice(0, 8), path: path.slice(0, 255) }));
    return key;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private dto(key: ApiKey) { return { id: key.id, name: key.name, environment: key.environment, prefix: key.prefix, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt }; }
}

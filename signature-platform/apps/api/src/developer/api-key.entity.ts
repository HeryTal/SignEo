import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity.js';

export type ApiKeyEnvironment = 'SANDBOX' | 'PRODUCTION';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 80 }) name!: string;
  @Column({ length: 16 }) environment!: ApiKeyEnvironment;
  @Column({ length: 24 }) prefix!: string;
  @Column({ name: 'secret_hash', length: 64, unique: true }) secretHash!: string;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' }) workspace!: Relation<Workspace>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

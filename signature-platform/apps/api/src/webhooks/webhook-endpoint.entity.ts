import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity.js';

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ length: 2048 }) url!: string;
  @Column({ name: 'secret_ciphertext', type: 'text' }) secretCiphertext!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) events!: string[];
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true }) disabledAt!: Date | null;
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' }) workspace!: Relation<Workspace>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

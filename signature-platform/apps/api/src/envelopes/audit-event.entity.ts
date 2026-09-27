import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Envelope } from './envelope.entity.js';
import { User } from '../users/user.entity.js';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 80 }) action!: string;
  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true }) actorEmail!: string | null;
  @Column({ type: 'jsonb', default: {} }) details!: Record<string, unknown>;
  @ManyToOne(() => Envelope, (envelope) => envelope.events, { onDelete: 'CASCADE' }) envelope!: Relation<Envelope>;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) actor!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Workspace } from '../workspaces/workspace.entity.js';

export type TemplateRecipient = {
  name: string;
  role: 'SIGNER' | 'APPROVER';
  signingOrder: number;
  signatureLevel: 'SIMPLE' | 'ADVANCED' | 'QUALIFIED';
  authenticationMethod: 'NONE' | 'EMAIL_OTP' | 'SMS_OTP';
};

@Entity('envelope_templates')
export class EnvelopeTemplate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 180 }) title!: string;
  @Column({ type: 'text', default: '' }) message!: string;
  @Column({ type: 'jsonb', default: [] })
  documents!: { originalName: string; storageName: string; mimeType: string; size: number; checksum: string }[];
  @Column({ type: 'jsonb', default: [] })
  fields!: Record<string, unknown>[];
  @Column({ type: 'jsonb', default: [] })
  recipients!: TemplateRecipient[];
  @Column({ name: 'collection_requests', type: 'jsonb', default: [] })
  collectionRequests!: Record<string, unknown>[];
  @Column({ name: 'preparation_settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  preparationSettings!: {
    signingMode?: 'SIMULTANEOUS' | 'SEQUENTIAL' | 'CUSTOM';
    documentOrder?: string[];
    documentVisibility?: string[][];
    documentVisibilitySlots?: number[][];
  };
  @Column({ name: 'allow_decline', type: 'boolean', default: false })
  allowDecline!: boolean;
  @Column({ name: 'expiration_days', type: 'int', nullable: true })
  expirationDays!: number | null;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  owner!: Relation<User>;
  @ManyToOne(() => Workspace, { nullable: true, onDelete: 'SET NULL' })
  workspace!: Relation<Workspace> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

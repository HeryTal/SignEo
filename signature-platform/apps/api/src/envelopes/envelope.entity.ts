import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/user.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { Recipient } from './recipient.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import type { UserBranding } from '../users/user.entity.js';

export type EnvelopeStatus =
  'DRAFT' | 'SENT' | 'PARTIALLY_SIGNED' | 'COMPLETED' | 'VOIDED' | 'EXPIRED';
export type EnvelopeFieldType =
  | 'SIGNATURE'
  | 'SIGN_DATE'
  | 'SIGNER_NAME'
  | 'SIGNER_EMAIL'
  | 'INITIALS'
  | 'READ_ONLY_TEXT'
  | 'TEXT'
  | 'MENTION'
  | 'CHECKBOX'
  | 'RADIO';
export type EnvelopeField = {
  id: string;
  type: EnvelopeFieldType;
  documentIndex: number;
  pageNumber: number;
  x: number;
  y: number;
  label: string;
  options?: string[];
  recipientEmail?: string;
  fontFamily?: 'SANS' | 'SERIF' | 'MONO' | 'SCRIPT';
  fontSize?: number;
  fontColor?: string;
  signatureDisplay?: 'MINIMAL' | 'DETAILED';
  width?: number;
  height?: number;
  dateValue?: string;
};
export type EnvelopeCollectionRequest = {
  id: string;
  label: string;
  recipientEmail: string;
  required: boolean;
};

@Entity('envelopes')
export class Envelope {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 180 }) title!: string;
  @Column({ type: 'text', default: '' }) message!: string;
  @Column({ name: 'fields', type: 'jsonb', default: [] })
  fields!: EnvelopeField[];
  @Column({ name: 'preparation_settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  preparationSettings!: {
    signingMode?: 'SIMULTANEOUS' | 'SEQUENTIAL' | 'CUSTOM';
    documentOrder?: string[];
    documentVisibility?: string[][];
  };
  @Column({ name: 'collection_requests', type: 'jsonb', default: [] })
  collectionRequests!: EnvelopeCollectionRequest[];
  @Column({ name: 'brand_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  brandSnapshot!: UserBranding;
  @Column({ name: 'text_fields', type: 'jsonb', default: [] })
  legacyTextFields!: {
    id: string;
    documentIndex: number;
    pageNumber: number;
    x: number;
    y: number;
    value: string;
  }[];
  @Column({ length: 32, default: 'DRAFT' }) status!: EnvelopeStatus;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
  @Column({ name: 'allow_decline', type: 'boolean', default: false })
  allowDecline!: boolean;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  owner!: Relation<User>;
  @OneToMany(() => EnvelopeDocument, (document) => document.envelope, {
    cascade: true,
  })
  documents!: Relation<EnvelopeDocument[]>;
  @OneToMany(() => Recipient, (recipient) => recipient.envelope, {
    cascade: true,
  })
  recipients!: Relation<Recipient[]>;
  @OneToMany(() => AuditEvent, (event) => event.envelope, { cascade: true })
  events!: Relation<AuditEvent[]>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Envelope } from './envelope.entity.js';

@Entity('envelope_documents')
export class EnvelopeDocument {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'original_name', length: 255 }) originalName!: string;
  @Column({ name: 'storage_name', length: 100, unique: true }) storageName!: string;
  @Column({ name: 'mime_type', length: 120 }) mimeType!: string;
  @Column({ type: 'bigint' }) size!: number;
  @Column({ length: 64 }) checksum!: string;
  @Column({ name: 'signed_storage_name', type: 'varchar', length: 100, nullable: true })
  signedStorageName!: string | null;
  @ManyToOne(() => Envelope, (envelope) => envelope.documents, { onDelete: 'CASCADE' }) envelope!: Relation<Envelope>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

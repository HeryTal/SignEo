import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Envelope } from './envelope.entity.js';

@Entity('recipients')
export class Recipient {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ length: 255 }) email!: string;
  @Column({ name: 'access_token', unique: true, length: 64 }) accessToken!: string;
  @Column({ length: 32, default: 'SIGNER' }) role!: string;
  @Column({ length: 32, default: 'WAITING' }) status!: string;
  @Column({ name: 'signing_order', type: 'int', default: 1 }) signingOrder!: number;
  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true }) signedAt!: Date | null;
  @ManyToOne(() => Envelope, (envelope) => envelope.recipients, { onDelete: 'CASCADE' }) envelope!: Relation<Envelope>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from './user.entity.js';

export type IdentityVerificationStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

@Entity('identity_verifications')
@Index(['user'], { unique: true })
export class IdentityVerification {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) user!: Relation<User>;
  @Column({ length: 24, default: 'NOT_STARTED' }) status!: IdentityVerificationStatus;
  @Column({ type: 'varchar', length: 80, nullable: true }) provider!: string | null;
  @Column({ name: 'provider_reference', type: 'varchar', length: 255, nullable: true, unique: true }) providerReference!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true }) rejectionReason!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

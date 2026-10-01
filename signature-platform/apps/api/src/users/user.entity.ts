import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserBranding = {
  displayName: string;
  accentColor: string;
  logoUrl: string;
  textFont: 'SANS' | 'SERIF' | 'MONO';
  signatureFont: 'SCRIPT' | 'SERIF' | 'SANS';
  textColor: string;
  signatureColor: string;
  textSize: number;
  signatureSize: number;
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'password_reset_token_hash', type: 'varchar', length: 64, nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({ name: 'password_reset_expires_at', type: 'timestamptz', nullable: true })
  passwordResetExpiresAt!: Date | null;

  @Column({ name: 'active_workspace_id', type: 'uuid', nullable: true })
  activeWorkspaceId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  branding!: UserBranding;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity.js';

export type SubscriptionPlan = 'FREE' | 'BUSINESS' | 'ENTERPRISE';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true }) billingEmail!: string | null;
  @Column({ name: 'billing_customer_id', type: 'varchar', length: 255, nullable: true }) billingCustomerId!: string | null;
  @Column({ name: 'subscription_plan', length: 24, default: 'FREE' }) subscriptionPlan!: SubscriptionPlan;
  @Column({ name: 'subscription_status', length: 24, default: 'TRIAL' }) subscriptionStatus!: SubscriptionStatus;
  @Column({ name: 'included_envelopes_per_month', type: 'int', default: 5 }) includedEnvelopesPerMonth!: number;
  @OneToMany(() => Workspace, (workspace) => workspace.organization) workspaces!: Relation<Workspace[]>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

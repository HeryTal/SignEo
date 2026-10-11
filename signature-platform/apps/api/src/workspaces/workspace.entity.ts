import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Organization } from '../organizations/organization.entity.js';
import { WorkspaceMember } from './workspace-member.entity.js';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 120 }) name!: string;
  @ManyToOne(() => Organization, (organization) => organization.workspaces, { nullable: false, onDelete: 'CASCADE' })
  organization!: Relation<Organization>;
  @OneToMany(() => WorkspaceMember, (member) => member.workspace, { cascade: true })
  members!: Relation<WorkspaceMember[]>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

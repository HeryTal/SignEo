import { CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique, Column } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Workspace } from './workspace.entity.js';

export type WorkspaceRole = 'ADMIN' | 'MANAGER' | 'SIGNER' | 'APPROVER';

@Entity('workspace_members')
@Unique(['workspace', 'user'])
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Workspace, (workspace) => workspace.members, { onDelete: 'CASCADE' })
  workspace!: Relation<Workspace>;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) user!: Relation<User>;
  @Column({ length: 16, default: 'SIGNER' }) role!: WorkspaceRole;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

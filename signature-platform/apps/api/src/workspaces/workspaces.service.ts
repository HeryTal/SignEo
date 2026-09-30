import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Workspace, } from './workspace.entity.js';
import { WorkspaceMember, type WorkspaceRole } from './workspace-member.entity.js';

const roles: WorkspaceRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async createPersonalWorkspace(user: User) {
    const workspace = await this.workspaces.save(this.workspaces.create({ name: user.name.trim() || 'Mon espace' }));
    await this.members.save(this.members.create({ workspace, user, role: 'ADMIN' }));
    await this.dataSource.query(
      'UPDATE envelopes SET "workspaceId" = $1 WHERE "ownerId" = $2 AND "workspaceId" IS NULL',
      [workspace.id, user.id],
    );
    user.activeWorkspaceId = workspace.id;
    await this.users.save(user);
    return workspace;
  }

  async activeForUser(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    let membership = user.activeWorkspaceId
      ? await this.members.findOne({ where: { workspace: { id: user.activeWorkspaceId }, user: { id: userId } }, relations: { workspace: true, user: true } })
      : null;
    if (!membership) {
      membership = await this.members.findOne({ where: { user: { id: userId } }, relations: { workspace: true, user: true }, order: { createdAt: 'ASC' } });
      if (!membership) {
        const workspace = await this.createPersonalWorkspace(user);
        membership = await this.members.findOneOrFail({ where: { workspace: { id: workspace.id }, user: { id: userId } }, relations: { workspace: true, user: true } });
      } else {
        user.activeWorkspaceId = membership.workspace.id;
        await this.users.save(user);
      }
    }
    return membership;
  }

  async profile(userId: string) {
    const active = await this.activeForUser(userId);
    const memberships = await this.members.find({ where: { user: { id: userId } }, relations: { workspace: true }, order: { createdAt: 'ASC' } });
    return { activeWorkspace: this.workspaceDto(active.workspace, active.role), workspaces: memberships.map((member) => this.workspaceDto(member.workspace, member.role)) };
  }

  async membersForActive(userId: string) {
    const active = await this.activeForUser(userId);
    const members = await this.members.find({ where: { workspace: { id: active.workspace.id } }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return { workspace: this.workspaceDto(active.workspace, active.role), members: members.map((member) => ({ id: member.id, name: member.user.name, email: member.user.email, role: member.role, isCurrentUser: member.user.id === userId })) };
  }

  async createWorkspace(userId: string, name: string) {
    if (!name.trim() || name.trim().length > 120) throw new BadRequestException('Le nom de l’espace doit contenir entre 1 et 120 caractères.');
    const user = await this.users.findOneByOrFail({ id: userId });
    const workspace = await this.workspaces.save(this.workspaces.create({ name: name.trim() }));
    await this.members.save(this.members.create({ workspace, user, role: 'ADMIN' }));
    user.activeWorkspaceId = workspace.id;
    await this.users.save(user);
    return this.profile(userId);
  }

  async selectWorkspace(userId: string, workspaceId: string) {
    const membership = await this.members.findOne({ where: { workspace: { id: workspaceId }, user: { id: userId } } });
    if (!membership) throw new ForbiddenException('Vous ne faites pas partie de cet espace.');
    await this.users.update(userId, { activeWorkspaceId: workspaceId });
    return this.profile(userId);
  }

  async addMember(userId: string, email: string, role: WorkspaceRole) {
    const active = await this.activeForUser(userId);
    this.requireAdmin(active.role);
    if (!roles.includes(role)) throw new BadRequestException('Rôle invalide.');
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new BadRequestException('Cette personne doit d’abord créer son compte Signeo avec cette adresse e-mail.');
    const exists = await this.members.findOne({ where: { workspace: { id: active.workspace.id }, user: { id: user.id } } });
    if (exists) throw new BadRequestException('Cette personne fait déjà partie de cet espace.');
    await this.members.save(this.members.create({ workspace: active.workspace, user, role }));
    return this.membersForActive(userId);
  }

  async updateMemberRole(userId: string, memberId: string, role: WorkspaceRole) {
    const active = await this.activeForUser(userId);
    this.requireAdmin(active.role);
    if (!roles.includes(role)) throw new BadRequestException('Rôle invalide.');
    const member = await this.members.findOne({ where: { id: memberId, workspace: { id: active.workspace.id } }, relations: { user: true } });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (member.user.id === userId && role !== 'ADMIN') throw new BadRequestException('Un administrateur ne peut pas retirer son propre rôle.');
    member.role = role;
    await this.members.save(member);
    return this.membersForActive(userId);
  }

  async removeMember(userId: string, memberId: string) {
    const active = await this.activeForUser(userId);
    this.requireAdmin(active.role);
    const member = await this.members.findOne({ where: { id: memberId, workspace: { id: active.workspace.id } }, relations: { user: true } });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (member.user.id === userId) throw new BadRequestException('Vous ne pouvez pas vous retirer vous-même de l’espace.');
    await this.members.remove(member);
    return this.membersForActive(userId);
  }

  requireWrite(role: WorkspaceRole) { if (role === 'VIEWER') throw new ForbiddenException('Votre rôle lecteur permet uniquement de consulter les enveloppes.'); }
  requireAdmin(role: WorkspaceRole) { if (role !== 'ADMIN') throw new ForbiddenException('Cette action est réservée aux administrateurs de l’espace.'); }
  private workspaceDto(workspace: Workspace, role: WorkspaceRole) { return { id: workspace.id, name: workspace.name, role }; }
}

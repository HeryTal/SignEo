import { ForbiddenException } from '@nestjs/common';
import type { WorkspaceRole } from './workspace-member.entity.js';

export type WorkspacePermission =
  | 'WORKSPACE_READ'
  | 'ENVELOPE_CREATE'
  | 'ENVELOPE_MANAGE'
  | 'TEAM_MANAGE'
  | 'BILLING_MANAGE'
  | 'IDENTITY_REVIEW';

const grants: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  ADMIN: ['WORKSPACE_READ', 'ENVELOPE_CREATE', 'ENVELOPE_MANAGE', 'TEAM_MANAGE', 'BILLING_MANAGE', 'IDENTITY_REVIEW'],
  MANAGER: ['WORKSPACE_READ', 'ENVELOPE_CREATE', 'ENVELOPE_MANAGE'],
  SIGNER: ['WORKSPACE_READ', 'ENVELOPE_CREATE'],
  APPROVER: ['WORKSPACE_READ'],
};

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission) {
  return grants[role].includes(permission);
}

export function requireWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission) {
  if (!hasWorkspacePermission(role, permission)) {
    throw new ForbiddenException('Votre rôle ne vous autorise pas à réaliser cette action.');
  }
}

import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Organization } from '../organizations/organization.entity.js';
import { AuditEvent } from '../envelopes/audit-event.entity.js';

export function quotaFor(organization: Pick<Organization, 'subscriptionPlan' | 'subscriptionStatus'>) {
  if (!['ACTIVE', 'TRIAL'].includes(organization.subscriptionStatus)) return 5;
  return { FREE: 5, BUSINESS: 50, ENTERPRISE: 250 }[organization.subscriptionPlan] ?? 5;
}

export async function monthlyUsage(manager: EntityManager, organizationId: string) {
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);
  return manager.getRepository(AuditEvent).createQueryBuilder('event')
    .innerJoin('event.envelope', 'envelope').innerJoin('envelope.workspace', 'workspace')
    .where('workspace.organizationId = :organizationId', { organizationId })
    .andWhere('event.action = :action', { action: 'ENVELOPE_SENT' })
    .andWhere('event.createdAt >= :since', { since }).getCount();
}

// Must run inside the send transaction; all workspaces share this row lock.
export async function assertSendQuota(manager: EntityManager, organizationId: string) {
  const organization = await manager.getRepository(Organization).findOneOrFail({
    where: { id: organizationId }, lock: { mode: 'pessimistic_write' },
  });
  if (await monthlyUsage(manager, organizationId) >= quotaFor(organization)) {
    throw new ForbiddenException('Quota mensuel atteint. Changez de forfait ou attendez le mois prochain.');
  }
}

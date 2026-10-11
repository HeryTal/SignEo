import { describe, expect, it } from 'vitest';
import { hasWorkspacePermission, requireWorkspacePermission } from './permissions.js';

describe('Autorisations d’espace', () => {
  it.each([
    ['ADMIN', 'BILLING_MANAGE', true],
    ['MANAGER', 'ENVELOPE_MANAGE', true],
    ['MANAGER', 'BILLING_MANAGE', false],
    ['SIGNER', 'ENVELOPE_CREATE', true],
    ['SIGNER', 'ENVELOPE_MANAGE', false],
    ['APPROVER', 'WORKSPACE_READ', true],
    ['APPROVER', 'ENVELOPE_CREATE', false],
  ] as const)('%s / %s = %s', (role, permission, expected) => {
    expect(hasWorkspacePermission(role, permission)).toBe(expected);
  });

  it('refuse une action non accordée', () => {
    expect(() => requireWorkspacePermission('SIGNER', 'BILLING_MANAGE')).toThrow('ne vous autorise pas');
  });
});

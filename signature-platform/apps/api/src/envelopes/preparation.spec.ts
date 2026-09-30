import { describe, expect, it, vi } from 'vitest';
import { EnvelopesService } from './envelopes.service.js';
import type { Envelope, EnvelopeField } from './envelope.entity.js';

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(), readFile: vi.fn() }));

function setup(dataSource: object = {}) {
  const envelopes = { create: vi.fn((value) => value), save: vi.fn(), findOne: vi.fn() };
  const documents = { create: vi.fn((value) => value) };
  const recipients = { create: vi.fn((value) => value), findOne: vi.fn(), save: vi.fn() };
  const events = { create: vi.fn((value) => value), save: vi.fn() };
  const users = { findOneByOrFail: vi.fn().mockResolvedValue({ id: 'owner', email: 'owner@example.com', branding: {} }) };
  const service = new EnvelopesService(envelopes as never, documents as never, recipients as never, events as never, users as never, dataSource as never, { sendInvitation: vi.fn() } as never);
  return { service, envelopes, recipients };
}
const people = [
  { name: 'Alice', email: 'alice@example.com', role: 'SIGNER' as const },
  { name: 'Bob', email: 'bob@example.com', role: 'SIGNER' as const },
  { name: 'Claire', email: 'claire@example.com', role: 'APPROVER' as const },
];
const files = [{ originalname: 'contrat.pdf', mimetype: 'application/pdf', size: 5, buffer: Buffer.from('%PDF-') }];
const fields: EnvelopeField[] = [{ id: 'signature', type: 'SIGNATURE', documentIndex: 0, pageNumber: 1, x: 10, y: 20, label: 'Signature', recipientEmail: people[0].email, signatureDisplay: 'DETAILED', width: 30, height: 9 }];

describe('Préparation des dossiers', () => {
  it.each(['2026-02-30', 'not-a-date', ''])('refuse une date de calendrier invalide : %s', async (date) => {
    const recipient = { id: 'alice', ...people[0], status: 'WAITING', envelope: { status: 'SENT', fields: [{ ...fields[0], type: 'SIGN_DATE' }], recipients: [] } };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient) }), save: vi.fn() };
    const { service } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    await expect(service.sign('token', 'Alice', true, { signature: date })).rejects.toThrow('date valide');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('conserve la date choisie et les coordonnées du destinataire dans les valeurs enregistrées', async () => {
    const recipient = { id: 'alice', ...people[0], status: 'WAITING', signingOrder: 1, envelope: { id: 'envelope', status: 'SENT', fields: [
      { ...fields[0], id: 'date', type: 'SIGN_DATE', dateValue: '2026-09-29' },
      { ...fields[0], id: 'name', type: 'SIGNER_NAME' },
      { ...fields[0], id: 'email', type: 'SIGNER_EMAIL' },
    ], recipients: [{ id: 'bob', status: 'WAITING', signingOrder: 1 }] } };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient) }), save: vi.fn() };
    const { service } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    await service.sign('token', 'Alice', true, { date: '2026-10-02', name: 'Autre nom', email: 'other@example.com' });
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ details: expect.objectContaining({ fieldValues: { date: '2026-10-02', name: 'Alice', email: people[0].email } }) }));
  });

  it.each([false, true])('autorise Bob avant Alice uniquement en simultané : %s', async (simultaneous) => {
    const alice = { id: 'alice', name: 'Alice', status: 'WAITING', signingOrder: 1 };
    const bob = { id: 'bob', name: 'Bob', email: people[1].email, role: 'SIGNER', status: 'WAITING', signingOrder: simultaneous ? 1 : 2 };
    const recipient = { ...bob, envelope: { id: 'envelope', status: 'SENT', fields: [], recipients: [alice, bob] } };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient) }), save: vi.fn() };
    const { service } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    const result = service.sign('bob-token', 'Bob', true);
    if (simultaneous) await expect(result).resolves.toMatchObject({ status: 'PARTIALLY_SIGNED' });
    else await expect(result).rejects.toThrow('Alice');
  });

  it.each([
    ['SIMULTANEOUS', [2, 2, 1]],
    ['SEQUENTIAL', [2, 3, 1]],
    ['CUSTOM', [1, 2, 3]],
  ] as const)('enregistre les priorités du mode %s', async (signingMode, orders) => {
    const { service, envelopes } = setup();
    await service.create('owner', 'Contrat', '', people, files, fields, undefined, false, [], { signingMode });
    const saved = envelopes.create.mock.calls[0][0];
    expect(saved.recipients.map((person: { signingOrder: number }) => person.signingOrder)).toEqual(orders);
    expect(saved.fields[0]).toMatchObject({ signatureDisplay: 'DETAILED', width: 30, height: 9 });
    expect(saved.preparationSettings.documentOrder).toEqual([saved.documents[0].storageName]);
  });

  it('refuse de masquer un document contenant un champ attribué au signataire', async () => {
    const { service } = setup();
    await expect(service.create('owner', 'Contrat', '', people, files, fields, undefined, false, [], { documentVisibility: [[people[1].email]] })).rejects.toThrow();
  });

  it('refuse une visibilité qui mentionne un destinataire inconnu', async () => {
    const { service } = setup();
    await expect(service.create('owner', 'Contrat', '', people, files, fields, undefined, false, [], { documentVisibility: [['unknown@example.com']] })).rejects.toThrow('Visibilité');
  });

  it('filtre les documents et bloque leur téléchargement direct sans décaler les champs', async () => {
    const { service, recipients } = setup();
    const envelope = {
      id: 'envelope', status: 'SENT', fields: [{ ...fields[0], documentIndex: 1 }],
      documents: [
        { id: 'visible', storageName: 'second', originalName: 'visible.pdf' },
        { id: 'hidden', storageName: 'first', originalName: 'hidden.pdf' },
      ],
      preparationSettings: { documentOrder: ['first', 'second'], documentVisibility: [[], [people[0].email]] },
    } as unknown as Envelope;
    recipients.findOne.mockResolvedValue({ ...people[0], status: 'WAITING', envelope });
    const invitation = await service.getPublicInvitation('private-token');
    expect(invitation.documents.map((document) => document.id)).toEqual(['visible']);
    expect(invitation.documents[0].fields[0]).toMatchObject({ id: 'signature', signatureDisplay: 'DETAILED' });
    await expect(service.publicDocument('private-token', 'hidden')).rejects.toThrow('Document introuvable');
    await expect(service.publicDocument('private-token', 'visible')).resolves.toMatchObject({ document: { id: 'visible' } });
  });
});

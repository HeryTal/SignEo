import { describe, expect, it, vi } from 'vitest';
import { EnvelopesService } from './envelopes.service.js';
import { Envelope, type EnvelopeField } from './envelope.entity.js';
import { readFile } from 'node:fs/promises';
import { Workspace } from '../workspaces/workspace.entity.js';

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(), readFile: vi.fn() }));

function setup(dataSource: object = {}) {
  const envelopes = { create: vi.fn((value) => value), save: vi.fn(), update: vi.fn().mockResolvedValue({ affected: 1 }), findOne: vi.fn() };
  const documents = { create: vi.fn((value) => value) };
  const templates = { create: vi.fn((value) => value), save: vi.fn((value) => ({ ...value, id: 'template-id', createdAt: new Date() })), findOne: vi.fn() };
  const recipients = { create: vi.fn((value) => value), findOne: vi.fn(), save: vi.fn(), update: vi.fn() };
  const events = { create: vi.fn((value) => value), save: vi.fn() };
  const users = { findOneByOrFail: vi.fn().mockResolvedValue({ id: 'owner', email: 'owner@example.com', branding: {} }) };
  const workspaceMembers = { findOne: vi.fn() };
  const workspaces = {
    activeForUser: vi.fn().mockResolvedValue({ workspace: { id: 'workspace' }, role: 'ADMIN' }),
    requireWrite: vi.fn(),
    requirePermission: vi.fn(),
  };
  const webhooks = { dispatch: vi.fn() };
  const mail = { sendInvitation: vi.fn().mockResolvedValue({ delivered: true }), sendReminder: vi.fn().mockResolvedValue({ delivered: true }) };
  if (!('transaction' in dataSource)) {
    Object.assign(dataSource, { transaction: (run: (manager: object) => unknown) => run({
      getRepository: () => envelopes, save: vi.fn(),
    }) });
  }
  const service = new EnvelopesService(
    envelopes as never,
    documents as never,
    templates as never,
    recipients as never,
    events as never,
    users as never,
    workspaceMembers as never,
    dataSource as never,
    mail as never,
    workspaces as never,
    webhooks as never,
  );
  return { service, envelopes, recipients, templates, mail, events };
}
const people = [
  { name: 'Alice', email: 'alice@example.com', role: 'SIGNER' as const },
  { name: 'Bob', email: 'bob@example.com', role: 'SIGNER' as const },
  { name: 'Claire', email: 'claire@example.com', role: 'APPROVER' as const },
];
const files = [{ originalname: 'contrat.pdf', mimetype: 'application/pdf', size: 5, buffer: Buffer.from('%PDF-') }];
const fields: EnvelopeField[] = [{ id: 'signature', type: 'SIGNATURE', documentIndex: 0, pageNumber: 1, x: 10, y: 20, label: 'Signature', recipientEmail: people[0].email, signatureDisplay: 'DETAILED', width: 30, height: 9 }];

describe('Modèles et workflow', () => {
  function source() {
    return {
      id: 'envelope', title: 'Contrat', message: '', status: 'SENT',
      owner: { id: 'owner', email: 'owner@example.com' }, workspace: { id: 'workspace' },
      documents: [{ id: 'document', originalName: 'contrat.pdf', storageName: 'source.pdf', mimeType: 'application/pdf', size: 5, checksum: 'abc' }],
      recipients: people.map((person, index) => ({ ...person, id: String(index), status: 'WAITING', signingOrder: index < 2 ? 3 : 7, authenticationMethod: 'EMAIL_OTP', signatureLevel: 'SIMPLE', accessToken: `token-${index}` })),
      fields, collectionRequests: [{ id: 'identity', label: 'Identité', recipientEmail: people[0].email, required: true }],
      preparationSettings: { signingMode: 'CUSTOM', documentVisibility: [[people[0].email, people[2].email]] },
      allowDecline: true,
    };
  }

  it('réattribue visibilité, champs et collecte aux nouveaux destinataires en conservant les groupes', async () => {
    const { service, envelopes, templates } = setup();
    envelopes.findOne.mockResolvedValue(source());
    vi.mocked(readFile).mockResolvedValue(Buffer.from('%PDF-'));
    await service.createTemplate('owner', 'envelope', 'Modèle');
    const template = templates.create.mock.calls[0][0];
    expect(template.preparationSettings.documentVisibility).toBeUndefined();
    expect(template.preparationSettings.documentVisibilitySlots).toEqual([[0, 2]]);
    templates.findOne.mockResolvedValue(template);
    vi.spyOn(service, 'send').mockResolvedValue({} as never);
    const replacements = people.map((person, index) => ({ ...person, email: `new${index}@example.com` }));
    await service.sendFromTemplate('owner', 'template-id', replacements, 'http://localhost:3000');
    const created = envelopes.create.mock.calls[0][0];
    expect(created.recipients.map((person: { signingOrder: number }) => person.signingOrder)).toEqual([3, 3, 7]);
    expect(created.recipients.map((person: { role: string }) => person.role)).toEqual(['SIGNER', 'SIGNER', 'APPROVER']);
    expect(created.preparationSettings.documentVisibility).toEqual([['new0@example.com', 'new2@example.com']]);
    expect(created.fields[0]).toMatchObject({ ...fields[0], recipientEmail: 'new0@example.com' });
    expect(created.collectionRequests[0].recipientEmail).toBe('new0@example.com');
    expect(created.allowDecline).toBe(true);
  });

  it('envoie les invitations initiales uniquement au premier groupe', async () => {
    const envelope = { ...source(), status: 'DRAFT' };
    const query = { innerJoin: () => query, where: () => query, andWhere: () => query, getCount: async () => 0 };
    const manager = { getRepository: (target: unknown) => ({ findOne: vi.fn().mockResolvedValue(envelope), findOneOrFail: async () => target === Workspace ? { organization: { id: 'org' } } : { subscriptionPlan: 'FREE', subscriptionStatus: 'TRIAL' }, createQueryBuilder: () => query }), save: vi.fn() };
    const { service, mail } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    await service.send('owner', 'envelope', 'http://localhost:3000');
    expect(mail.sendInvitation.mock.calls.map(([invite]) => invite.to)).toEqual([people[0].email, people[1].email]);
  });

  it.each([false, true])('invite le groupe suivant seulement après tout le groupe précédent : %s', async (groupCompleted) => {
    const envelope = source();
    envelope.fields = [];
    envelope.collectionRequests = [];
    const recipient = { ...envelope.recipients[0], authenticationMethod: 'NONE', envelope };
    envelope.recipients[1].status = groupCompleted ? 'SIGNED' : 'WAITING';
    const pending = () => ({ ...envelope, recipients: envelope.recipients.map((person, index) => ({ ...person, status: index === 0 ? 'SIGNED' : person.status, lastRemindedAt: index < 2 ? new Date() : null })) });
    const manager = { getRepository: (target: unknown) => ({ findOne: vi.fn().mockImplementation(async () => target === Envelope ? pending() : recipient), update: vi.fn() }), save: vi.fn() };
    const { service, mail } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    await service.sign('token', 'Alice', true);
    expect(mail.sendInvitation.mock.calls.map(([invite]) => invite.to)).toEqual(groupCompleted ? [people[2].email] : []);
  });

  it('autorise le rappel actif et refuse celui du groupe suivant', async () => {
    const { service, recipients, mail } = setup();
    const envelope = source();
    recipients.findOne.mockResolvedValue({ ...envelope.recipients[0], envelope });
    await expect(service.remind('owner', 'envelope', '0', 'http://localhost:3000')).resolves.toEqual({ delivered: true });
    recipients.findOne.mockResolvedValue({ ...envelope.recipients[2], envelope });
    await expect(service.remind('owner', 'envelope', '2', 'http://localhost:3000')).rejects.toThrow();
    expect(mail.sendReminder).toHaveBeenCalledTimes(1);
  });

  it.each(['SENT', 'PARTIALLY_SIGNED', 'COMPLETED', 'VOIDED', 'EXPIRED', 'DRAFT'])('contrôle l’annulation depuis %s', async (status) => {
    const { service, envelopes } = setup();
    envelopes.findOne.mockResolvedValue({ ...source(), status });
    if (['SENT', 'PARTIALLY_SIGNED'].includes(status)) {
      await expect(service.cancel('owner', 'envelope')).resolves.toEqual({ status: 'VOIDED' });
    } else {
      await expect(service.cancel('owner', 'envelope')).rejects.toThrow();
      expect(envelopes.save).not.toHaveBeenCalled();
    }
  });

  const blockedStates = ['COMPLETED', 'VOIDED', 'EXPIRED', 'DRAFT', 'PAST_DUE', 'LATER_STEP'];
  it('refuse l’envoi et l’annulation dès que la date limite est dépassée', async () => {
    const envelope = { ...source(), status: 'DRAFT', expiresAt: new Date(Date.now() - 1000) };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(envelope) }), save: vi.fn() };
    const { service, envelopes, mail } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    await expect(service.send('owner', 'envelope', 'http://localhost:3000')).rejects.toThrow('expiré');
    expect(mail.sendInvitation).not.toHaveBeenCalled();
    envelope.status = 'SENT';
    envelopes.findOne.mockResolvedValue(envelope);
    await expect(service.cancel('owner', 'envelope')).rejects.toThrow('expiré');
    expect(envelope.status).toBe('SENT');
  });
  const actions = ['invitation', 'document', 'upload', 'otp', 'sign', 'decline', 'remind'];
  it.each(blockedStates.flatMap((status) => actions.map((action) => [status, action])))('bloque %s : %s', async (status, action) => {
    const envelope = { ...source(), status: ['PAST_DUE', 'LATER_STEP'].includes(status) ? 'SENT' : status, expiresAt: status === 'PAST_DUE' ? new Date(Date.now() - 1000) : null };
    const recipient = { ...envelope.recipients[status === 'LATER_STEP' ? 2 : 0], envelope };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient), save: vi.fn() }), save: vi.fn() };
    const { service, recipients, mail } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });
    recipients.findOne.mockResolvedValue(recipient);
    const calls: Record<string, () => Promise<unknown>> = {
      invitation: () => service.getPublicInvitation('token'),
      document: () => service.publicDocument('token', 'document'),
      upload: () => service.uploadCollection('token', 'identity', files[0]),
      otp: () => service.requestEmailOtp('token'),
      sign: () => service.sign('token', 'Alice', true),
      decline: () => service.decline('token', 'Refus'),
      remind: () => service.remind('owner', 'envelope', recipient.id, 'http://localhost:3000'),
    };
    await expect(calls[action]()).rejects.toThrow();
    expect(mail.sendReminder).not.toHaveBeenCalled();
    expect(recipients.save).not.toHaveBeenCalled();
  });
});

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

  it('conserve la signature dessinée pour son insertion dans le PDF final', async () => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.writeUInt32BE(600, 16);
    png.writeUInt32BE(150, 20);
    const drawnSignature = `data:image/png;base64,${png.toString('base64')}`;
    const recipient = {
      id: 'alice',
      ...people[0],
      status: 'WAITING',
      signingOrder: 1,
      envelope: {
        id: 'envelope',
        status: 'SENT',
        fields: [fields[0]],
        recipients: [{ id: 'bob', status: 'WAITING', signingOrder: 2 }],
      },
    };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient) }), save: vi.fn() };
    const { service } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });

    await service.sign('token', 'Alice Martin', true, { signature: drawnSignature });

    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ fieldValues: { signature: drawnSignature } }),
      }),
    );
  });

  it('refuse les images de signature dessinée surdimensionnées', async () => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.writeUInt32BE(4000, 16);
    png.writeUInt32BE(150, 20);
    const recipient = {
      id: 'alice',
      ...people[0],
      status: 'WAITING',
      signingOrder: 1,
      envelope: { id: 'envelope', status: 'SENT', fields: [fields[0]], recipients: [] },
    };
    const manager = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(recipient) }), save: vi.fn() };
    const { service } = setup({ transaction: (run: (value: typeof manager) => unknown) => run(manager) });

    await expect(service.sign('token', 'Alice', true, {
      signature: `data:image/png;base64,${png.toString('base64')}`,
    })).rejects.toThrow('invalide ou trop volumineux');
    expect(manager.save).not.toHaveBeenCalled();
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

  it('enregistre une copie réutilisable du document et des champs de l’enveloppe source', async () => {
    const { service, envelopes, templates } = setup();
    envelopes.findOne.mockResolvedValue({
      id: 'source',
      owner: { id: 'owner', email: 'owner@example.com' },
      workspace: { id: 'workspace' },
      title: 'Contrat de mission',
      message: 'Bonjour',
      documents: [{ id: 'document', originalName: 'contrat.pdf', storageName: 'source.pdf', mimeType: 'application/pdf', size: 5, checksum: 'abc', createdAt: new Date() }],
      recipients: [{ name: 'Alice Martin', email: 'alice@example.com', role: 'SIGNER', signingOrder: 1, signatureLevel: 'SIMPLE', authenticationMethod: 'NONE' }],
      fields,
      collectionRequests: [],
      preparationSettings: { signingMode: 'SEQUENTIAL' },
      allowDecline: false,
    });

    await expect(service.createTemplate('owner', 'source', 'Contrat récurrent')).resolves.toMatchObject({
      id: 'template-id',
      title: 'Contrat récurrent',
    });
    expect(templates.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Contrat récurrent',
      documents: [expect.objectContaining({ originalName: 'contrat.pdf' })],
      fields: [expect.objectContaining({ recipientSlot: 0 })],
      recipients: [expect.objectContaining({ role: 'SIGNER', signingOrder: 1 })],
    }));
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

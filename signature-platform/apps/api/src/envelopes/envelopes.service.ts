import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import {
  Envelope,
  EnvelopeCollectionRequest,
  EnvelopeField,
} from './envelope.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { EnvelopeTemplate } from './envelope-template.entity.js';
import { Recipient } from './recipient.entity.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { Cron } from '@nestjs/schedule';
import { MailService } from './mail.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { WorkspaceMember } from '../workspaces/workspace-member.entity.js';
import { WorkspaceMember as WorkspaceMemberEntity } from '../workspaces/workspace-member.entity.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';

export type IncomingRecipient = {
  name: string;
  email: string;
  role?: 'SIGNER' | 'APPROVER';
  signatureLevel?: 'SIMPLE' | 'ADVANCED' | 'QUALIFIED';
  authenticationMethod?: 'NONE' | 'EMAIL_OTP' | 'SMS_OTP';
};
export type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
export type IncomingField = EnvelopeField;
export type IncomingCollectionRequest = EnvelopeCollectionRequest;
const FIELD_TYPES = [
  'SIGNATURE',
  'SIGN_DATE',
  'SIGNER_NAME',
  'SIGNER_EMAIL',
  'INITIALS',
  'READ_ONLY_TEXT',
  'TEXT',
  'MENTION',
  'CHECKBOX',
  'RADIO',
];

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP "store" format: no external dependency and no compression of evidence files.
function createEvidenceZip(entries: { name: string; data: Buffer }[]) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8); header.writeUInt32LE(0, 10); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(entry.data.length, 18); header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    local.push(header, name, entry.data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(0, 10); directory.writeUInt32LE(0, 12);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(entry.data.length, 20); directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt16LE(0, 30); directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34); directory.writeUInt16LE(0, 36); directory.writeUInt32LE(0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.data.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, end]);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

@Injectable()
export class EnvelopesService {
  private readonly uploadDirectory = resolve(
    process.cwd(),
    process.env.UPLOAD_DIRECTORY ?? 'uploads',
  );

  constructor(
    @InjectRepository(Envelope)
    private readonly envelopes: Repository<Envelope>,
    @InjectRepository(EnvelopeDocument)
    private readonly documents: Repository<EnvelopeDocument>,
    @InjectRepository(EnvelopeTemplate)
    private readonly templates: Repository<EnvelopeTemplate>,
    @InjectRepository(Recipient)
    private readonly recipients: Repository<Recipient>,
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WorkspaceMemberEntity) private readonly workspaceMembers: Repository<WorkspaceMemberEntity>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly workspaces: WorkspacesService,
    private readonly webhooks: WebhooksService,
  ) {}

  async create(
    ownerId: string,
    title: string,
    message: string,
    recipientsInput: IncomingRecipient[],
    files: UploadedFile[],
    fields: IncomingField[] = [],
    expiresAt?: string,
    allowDecline = false,
    collectionRequests: IncomingCollectionRequest[] = [],
    preparationSettings: Envelope['preparationSettings'] = {},
    apiEnvironment: Envelope['apiEnvironment'] = 'PRODUCTION',
    workspaceId?: string,
    templateSigningOrders?: number[],
  ) {
    if (!preparationSettings || !['SIMULTANEOUS', 'SEQUENTIAL', 'CUSTOM'].includes(preparationSettings.signingMode ?? 'SEQUENTIAL'))
      throw new BadRequestException('Ordre des destinataires invalide.');
    const expiration = expiresAt ? new Date(expiresAt) : null;
    if (
      expiresAt &&
      (!expiration ||
        Number.isNaN(expiration.getTime()) ||
        expiration.getTime() <= Date.now() ||
        expiration.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000)
    ) {
      throw new BadRequestException(
        'La date d’expiration doit être comprise entre aujourd’hui et un an.',
      );
    }
    if (!files?.length)
      throw new BadRequestException('Ajoutez au moins un document.');
    if (
      !recipientsInput?.length ||
      recipientsInput.filter((recipient) => recipient.role !== 'APPROVER')
        .length > 100 ||
      recipientsInput.filter((recipient) => recipient.role === 'APPROVER')
        .length > 10 ||
      !recipientsInput.some((recipient) => recipient.role !== 'APPROVER')
    ) {
      throw new BadRequestException(
        'Ajoutez au moins un signataire. Limites : 100 signataires et 10 approbateurs.',
      );
    }
    for (const recipient of recipientsInput) {
      if (
        !recipient.name?.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email ?? '')
      ) {
        throw new BadRequestException(
          'Chaque destinataire doit avoir un nom et une adresse e-mail valide.',
        );
      }
    }
    const signerEmails = recipientsInput
      .filter((recipient) => recipient.role !== 'APPROVER')
      .map((recipient) => recipient.email.trim().toLowerCase());
    const allEmails = recipientsInput.map((item) => item.email.trim().toLowerCase());
    if (new Set(allEmails).size !== allEmails.length)
      throw new BadRequestException('Chaque destinataire doit avoir une adresse e-mail distincte.');
    const visibility = preparationSettings.documentVisibility;
    if (visibility !== undefined && (!Array.isArray(visibility) || visibility.length !== files.length || visibility.some((emails) => !Array.isArray(emails) || emails.some((email) => typeof email !== 'string' || !allEmails.includes(email)))))
      throw new BadRequestException('Visibilité des documents invalide.');
    if (
      !Array.isArray(collectionRequests) ||
      collectionRequests.length > 10 ||
      collectionRequests.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          item.id.length > 80 ||
          typeof item.label !== 'string' ||
          !item.label.trim() ||
          item.label.length > 160 ||
          !signerEmails.includes(item.recipientEmail?.trim().toLowerCase()) ||
          typeof item.required !== 'boolean',
      )
    ) {
      throw new BadRequestException(
        'Vérifiez les documents demandés et leur destinataire (maximum 10).',
      );
    }
    if (
      !Array.isArray(fields) ||
      fields.length > 100 ||
      fields.some(
        (field) =>
          !field ||
          typeof field.id !== 'string' ||
          field.id.length > 80 ||
          !FIELD_TYPES.includes(field.type) ||
          !Number.isInteger(field.documentIndex) ||
          field.documentIndex < 0 ||
          field.documentIndex >= files.length ||
          !Number.isInteger(field.pageNumber) ||
          field.pageNumber < 1 ||
          field.pageNumber > 1000 ||
          !Number.isFinite(field.x) ||
          field.x < 0 ||
          field.x > 100 ||
          !Number.isFinite(field.y) ||
          field.y < 0 ||
          field.y > 100 ||
          typeof field.label !== 'string' ||
          field.label.length > 160 ||
          (field.fontFamily !== undefined && !['SANS', 'SERIF', 'MONO', 'SCRIPT'].includes(field.fontFamily)) ||
          (field.fontSize !== undefined && (!Number.isInteger(field.fontSize) || field.fontSize < 8 || field.fontSize > 30)) ||
          (field.fontColor !== undefined && !/^#[\da-f]{6}$/i.test(field.fontColor)) ||
          (field.signatureDisplay !== undefined && !['MINIMAL', 'DETAILED'].includes(field.signatureDisplay)) ||
          (field.dateValue !== undefined && field.dateValue !== '' && !isCalendarDate(field.dateValue)) ||
          (field.width !== undefined && (!Number.isFinite(field.width) || field.width < 5 || field.width > 100 || field.x + field.width > 100.01)) ||
          (field.height !== undefined && (!Number.isFinite(field.height) || field.height < 2 || field.height > 50 || field.y + field.height > 100.01)) ||
          (visibility !== undefined && field.recipientEmail !== undefined && !visibility[field.documentIndex]?.includes(field.recipientEmail.trim().toLowerCase())) ||
          (field.recipientEmail !== undefined &&
            !signerEmails.includes(
              field.recipientEmail.trim().toLowerCase(),
            )) ||
          (field.type === 'RADIO' &&
            (!Array.isArray(field.options) ||
              field.options.length < 2 ||
              field.options.length > 6 ||
              field.options.some(
                (option) => typeof option !== 'string' || option.length > 80,
              ))),
      )
    )
      throw new BadRequestException(
        'Un champ texte contient une position invalide.',
      );
    const hasPdf = files.some(
      (file) => extname(file.originalname).toLowerCase() === '.pdf',
    );
    if (
      hasPdf &&
      (!fields.some((field) => field.type === 'SIGNATURE') ||
        !fields.some((field) =>
          [
            'SIGNATURE',
            'TEXT',
            'MENTION',
            'CHECKBOX',
            'RADIO',
            'INITIALS',
          ].includes(field.type),
        ))
    ) {
      throw new BadRequestException(
        'Placez au moins une signature et un champ à compléter par un signataire.',
      );
    }

    const owner = await this.users.findOneByOrFail({ id: ownerId });
    const membership = workspaceId
      ? await this.workspaceMembers.findOneOrFail({ where: { workspace: { id: workspaceId }, user: { id: ownerId } }, relations: { workspace: true } })
      : await this.workspaces.activeForUser(ownerId);
    this.workspaces.requireWrite(membership.role);
    for (const recipient of recipientsInput) {
      if (!['SIMPLE', 'ADVANCED', 'QUALIFIED'].includes(recipient.signatureLevel ?? 'SIMPLE'))
        throw new BadRequestException('Niveau de signature invalide.');
      if (!['NONE', 'EMAIL_OTP', 'SMS_OTP'].includes(recipient.authenticationMethod ?? 'NONE'))
        throw new BadRequestException('Méthode d’authentification invalide.');
      if ((recipient.signatureLevel ?? 'SIMPLE') !== 'SIMPLE')
        throw new BadRequestException('Les niveaux avancé et qualifié nécessitent un prestataire de confiance. Choisissez SIMPLE jusqu’à sa configuration.');
      if (recipient.authenticationMethod === 'SMS_OTP')
        throw new BadRequestException('La vérification SMS nécessite un fournisseur SMS configuré. Utilisez EMAIL_OTP ou NONE.');
    }
    await mkdir(this.uploadDirectory, { recursive: true });
    const storedFiles: string[] = [];
    try {
      const documentEntities: EnvelopeDocument[] = [];
      for (const file of files) {
        this.validateFile(file);
        const storageName = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
        await writeFile(join(this.uploadDirectory, storageName), file.buffer, {
          flag: 'wx',
        });
        storedFiles.push(join(this.uploadDirectory, storageName));
        documentEntities.push(
          this.documents.create({
            originalName: file.originalname
              .replace(/[\\/]/g, '_')
              .slice(0, 255),
            storageName,
            mimeType: file.mimetype,
            size: file.size,
            checksum: createHash('sha256').update(file.buffer).digest('hex'),
          }),
        );
      }

      const envelope = this.envelopes.create({
        title: title?.trim() || files[0].originalname.replace(/\.[^.]+$/, ''),
        message: message?.trim() ?? '',
        status: 'DRAFT',
        apiEnvironment,
        expiresAt: expiration,
        allowDecline,
        preparationSettings: {
          signingMode: preparationSettings.signingMode ?? 'SEQUENTIAL',
          documentVisibility: visibility,
          documentOrder: documentEntities.map((document) => document.storageName),
        },
        brandSnapshot: {
          displayName: owner.branding?.displayName?.trim() || 'Signeo',
          accentColor: /^#[\da-f]{6}$/i.test(owner.branding?.accentColor ?? '') ? owner.branding.accentColor : '#496b50',
          logoUrl: owner.branding?.logoUrl ?? '',
        },
        collectionRequests: collectionRequests.map((item) => ({
          ...item,
          label: item.label.trim(),
          recipientEmail: item.recipientEmail.trim().toLowerCase(),
        })),
        fields: fields.map(
          ({
            id,
            type,
            documentIndex,
            pageNumber,
            x,
            y,
            label,
            options,
            recipientEmail,
            fontFamily,
            fontSize,
            fontColor,
            signatureDisplay,
            width,
            height,
            dateValue,
          }) => ({
            id,
            type,
            documentIndex,
            pageNumber,
            x,
            y,
            label,
            options,
            signatureDisplay: signatureDisplay ?? 'MINIMAL',
            dateValue: dateValue || undefined,
            width,
            height,
            recipientEmail: recipientEmail?.trim().toLowerCase(),
            fontFamily: fontFamily ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureFont : owner.branding?.textFont) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? 'SCRIPT' : 'SANS'),
            fontSize: fontSize ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureSize : owner.branding?.textSize) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? 22 : 11),
            fontColor: fontColor ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureColor : owner.branding?.textColor) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? '#315b45' : '#24352b'),
          }),
        ),
        owner,
        workspace: membership.workspace,
        documents: documentEntities,
        recipients: recipientsInput.map((recipient, index) =>
          this.recipients.create({
            name: recipient.name.trim(),
            email: recipient.email.trim().toLowerCase(),
            role: recipient.role ?? 'SIGNER',
            signingOrder: templateSigningOrders?.[index] ?? (preparationSettings.signingMode === 'CUSTOM' || !preparationSettings.signingMode
              ? index + 1
              : recipient.role === 'APPROVER' ? 1
                : preparationSettings.signingMode === 'SIMULTANEOUS' ? 2
                  : recipientsInput.slice(0, index + 1).filter((item) => item.role !== 'APPROVER').length + 1),
            accessToken: randomUUID().replaceAll('-', ''),
            status: 'WAITING',
            signatureLevel: recipient.signatureLevel ?? 'SIMPLE',
            authenticationMethod: recipient.authenticationMethod ?? 'NONE',
          }),
        ),
      });
      await this.envelopes.save(envelope);
      await this.events.save(
        this.events.create({
          envelope,
          actor: owner,
          actorEmail: owner.email,
          action: 'ENVELOPE_CREATED',
          details: {
            documentCount: files.length,
            recipientCount: recipientsInput.length,
          },
        }),
      );
      const response = this.toDto(envelope);
      void this.webhooks.dispatch(membership.workspace.id, 'envelope.created', { envelopeId: envelope.id, title: envelope.title, status: envelope.status, environment: envelope.apiEnvironment });
      return response;
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await Promise.all(
        storedFiles.map((filePath) => unlink(filePath).catch(() => undefined)),
      );
      throw error;
    }
  }

  async createFromApi(workspaceId: string, environment: Envelope['apiEnvironment'], title: string, message: string, recipients: IncomingRecipient[], files: UploadedFile[], fields: IncomingField[] = [], expiresAt?: string, allowDecline = false) {
    const member = await this.workspaceMembers.findOne({ where: { workspace: { id: workspaceId }, role: 'ADMIN' }, relations: { user: true } });
    if (!member) throw new BadRequestException('Cet espace doit avoir un administrateur pour créer une enveloppe par API.');
    return this.create(member.user.id, title, message, recipients, files, fields, expiresAt, allowDecline, [], { signingMode: 'SEQUENTIAL' }, environment, workspaceId);
  }

  async list(ownerId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const items = await this.envelopes.createQueryBuilder('envelope')
      .leftJoinAndSelect('envelope.documents', 'documents')
      .leftJoinAndSelect('envelope.recipients', 'recipients')
      .where('envelope.workspaceId = :workspaceId', { workspaceId: membership.workspace.id })
      .orWhere('envelope.workspaceId IS NULL AND envelope.ownerId = :ownerId', { ownerId })
      .orderBy('envelope.createdAt', 'DESC')
      .getMany();
    return items.map((item) => this.toDto(item));
  }

  async activity(ownerId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const events = await this.events.createQueryBuilder('event')
      .innerJoinAndSelect('event.envelope', 'envelope')
      .where('envelope.workspaceId = :workspaceId', { workspaceId: membership.workspace.id })
      .orWhere('envelope.workspaceId IS NULL AND envelope.ownerId = :ownerId', { ownerId })
      .orderBy('event.createdAt', 'DESC').take(8).getMany();
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      actorEmail: event.actorEmail,
      createdAt: event.createdAt,
      title: event.envelope.title,
    }));
  }

  async listTemplates(ownerId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const items = await this.templates.createQueryBuilder('template')
      .where('template.workspaceId = :workspaceId', { workspaceId: membership.workspace.id })
      .orWhere('template.workspaceId IS NULL AND template.ownerId = :ownerId', { ownerId })
      .orderBy('template.createdAt', 'DESC')
      .getMany();
    return items.map(({ id, title, message, recipients, expirationDays, createdAt }) => ({
      id,
      title,
      message,
      recipients,
      expirationDays,
      createdAt,
    }));
  }

  async createTemplate(ownerId: string, envelopeId: string, title: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    this.workspaces.requirePermission(membership.role, 'ENVELOPE_MANAGE');
    const source = await this.envelopes.findOne({
      where: { id: envelopeId },
      relations: { documents: true, recipients: true, owner: true, workspace: true },
    });
    this.assertReadable(source, ownerId, membership);
    if (!source.documents.length || !source.recipients.length) {
      throw new BadRequestException('Un document avec ses destinataires est nécessaire pour créer un modèle.');
    }
    const label = title.trim();
    if (!label || label.length > 180) {
      throw new BadRequestException('Le nom du modèle doit contenir entre 1 et 180 caractères.');
    }
    const orderedRecipients = [...source.recipients].sort((a, b) => a.signingOrder - b.signingOrder);
    const files: EnvelopeTemplate['documents'] = [];
    const copiedFiles: string[] = [];
    try {
      for (const document of this.orderedDocuments(source)) {
        const storageName = `${randomUUID()}-template${extname(document.originalName).toLowerCase()}`;
        await writeFile(join(this.uploadDirectory, storageName), await readFile(join(this.uploadDirectory, document.storageName)), { flag: 'wx' });
        copiedFiles.push(join(this.uploadDirectory, storageName));
        files.push({
          originalName: document.originalName,
          storageName,
          mimeType: document.mimeType,
          size: Number(document.size),
          checksum: document.checksum,
        });
      }
      const templateFields = (source.fields ?? []).map((field) => {
        const recipientSlot = orderedRecipients.findIndex((recipient) => recipient.email === field.recipientEmail);
        const { recipientEmail: _recipientEmail, ...fieldData } = field;
        void _recipientEmail;
        return { ...fieldData, recipientSlot: recipientSlot < 0 ? undefined : recipientSlot };
      });
      const templateCollections = (source.collectionRequests ?? []).map((request) => {
        const recipientSlot = orderedRecipients.findIndex((recipient) => recipient.email === request.recipientEmail);
        const { recipientEmail: _recipientEmail, ...requestData } = request;
        void _recipientEmail;
        return { ...requestData, recipientSlot };
      });
      const template = this.templates.create({
        title: label,
        message: source.message,
        documents: files,
        fields: templateFields,
        recipients: orderedRecipients.map((recipient, index) => ({
          name: `${recipient.role === 'APPROVER' ? 'Approbateur' : 'Signataire'} ${index + 1}`,
          role: recipient.role as 'SIGNER' | 'APPROVER',
          signingOrder: recipient.signingOrder,
          signatureLevel: recipient.signatureLevel,
          authenticationMethod: recipient.authenticationMethod,
        })),
        collectionRequests: templateCollections,
        preparationSettings: {
          ...source.preparationSettings,
          documentOrder: undefined,
          documentVisibility: undefined,
          documentVisibilitySlots: source.preparationSettings?.documentVisibility?.map((emails) =>
            emails.map((email) => orderedRecipients.findIndex((recipient) => recipient.email === email)),
          ),
        },
        allowDecline: source.allowDecline,
        expirationDays: source.expiresAt && source.expiresAt.getTime() > source.createdAt.getTime()
          ? Math.min(366, Math.max(1, Math.ceil((source.expiresAt.getTime() - source.createdAt.getTime()) / (24 * 60 * 60 * 1000))))
          : null,
        owner: source.owner,
        workspace: source.workspace,
      });
      const saved = await this.templates.save(template);
      return { id: saved.id, title: saved.title, createdAt: saved.createdAt };
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await Promise.all(copiedFiles.map((path) => unlink(path).catch(() => undefined)));
      throw error;
    }
  }

  async sendFromTemplate(ownerId: string, templateId: string, recipientsInput: IncomingRecipient[], webOrigin: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    this.workspaces.requirePermission(membership.role, 'ENVELOPE_MANAGE');
    const template = await this.templates.findOne({
      where: { id: templateId },
      relations: { owner: true, workspace: true },
    });
    if (!template || (template.workspace ? template.workspace.id !== membership.workspace.id : template.owner.id !== ownerId)) {
      throw new NotFoundException('Modèle introuvable.');
    }
    if (recipientsInput.length !== template.recipients.length) {
      throw new BadRequestException('Renseignez exactement le nombre de destinataires défini par le modèle.');
    }
    const uploadedFiles: UploadedFile[] = await Promise.all(template.documents.map(async (document) => ({
      originalname: document.originalName,
      mimetype: document.mimeType,
      size: document.size,
      buffer: await readFile(join(this.uploadDirectory, document.storageName)),
    })));
    const orderedSlots = [...template.recipients];
    const fields = template.fields.map((value) => {
      const { recipientSlot, ...field } = value;
      const slot = typeof recipientSlot === 'number' ? recipientSlot : -1;
      const recipient = recipientsInput[slot];
      return {
        ...field,
        ...(recipient ? { recipientEmail: recipient.email.trim().toLowerCase() } : {}),
      };
    }) as IncomingField[];
    const collectionRequests = template.collectionRequests.map((value) => {
      const { recipientSlot, ...request } = value;
      const recipient = typeof recipientSlot === 'number' ? recipientsInput[recipientSlot] : undefined;
      return { ...request, ...(recipient ? { recipientEmail: recipient.email.trim().toLowerCase() } : {}) };
    }) as IncomingCollectionRequest[];
    const created = await this.create(
      ownerId,
      template.title,
      template.message,
      recipientsInput.map((recipient, index) => ({
        ...recipient,
        role: orderedSlots[index].role,
        signatureLevel: orderedSlots[index].signatureLevel,
        authenticationMethod: orderedSlots[index].authenticationMethod,
      })),
      uploadedFiles,
      fields,
      template.expirationDays
        ? new Date(Date.now() + template.expirationDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      template.allowDecline,
      collectionRequests,
      {
        ...template.preparationSettings,
        documentVisibility: template.preparationSettings.documentVisibilitySlots?.map((slots) =>
          slots.map((slot) => recipientsInput[slot].email.trim().toLowerCase()),
        ) ?? template.preparationSettings.documentVisibility,
      },
      'PRODUCTION',
      undefined,
      orderedSlots.map((slot) => slot.signingOrder),
    );
    return this.send(ownerId, created.id, webOrigin);
  }

  async get(ownerId: string, id: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const envelope = await this.envelopes.findOne({
      where: { id },
      relations: { documents: true, recipients: true, events: true, workspace: true, owner: true },
    });
    this.assertReadable(envelope, ownerId, membership);
    if (envelope.status === 'COMPLETED' && envelope.documents.some((document) => !document.finalStorageName || (process.env.SIGNING_P12_PATH && process.env.SIGNING_P12_PASSWORD && !document.signedStorageName))) {
      try { await this.createCompletedPdfs(envelope); }
      catch (error) { console.error('PDF final generation failed:', error instanceof Error ? error.message : 'Unknown error'); }
    }
    return {
      ...this.toDto(envelope),
      events: envelope.events.map((event) => ({
        id: event.id,
        action: event.action,
        actorEmail: event.actorEmail,
        createdAt: event.createdAt,
        details: event.details,
      })),
    };
  }

  async collectedDocument(
    ownerId: string,
    envelopeId: string,
    recipientId: string,
    requestId: string,
  ) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const recipient = await this.recipients.findOne({
      where: {
        id: recipientId,
        envelope: { id: envelopeId },
      },
      relations: { envelope: { owner: true, workspace: true } },
    });
    this.assertReadable(recipient?.envelope, ownerId, membership, 'Document introuvable.');
    const file = (recipient.collectionFiles ?? []).find(
      (item) => item.requestId === requestId,
    );
    if (!file) throw new NotFoundException('Document collecté introuvable.');
    return {
      file,
      path: join(this.uploadDirectory, file.storageName),
    };
  }

  async send(ownerId: string, id: string, webOrigin: string, workspaceId?: string, environment?: Envelope['apiEnvironment']) {
    const membership = workspaceId
      ? await this.workspaceMembers.findOneOrFail({ where: { workspace: { id: workspaceId }, user: { id: ownerId } }, relations: { workspace: true } })
      : await this.workspaces.activeForUser(ownerId);
    this.workspaces.requirePermission(membership.role, 'ENVELOPE_MANAGE');
    const result = await this.dataSource.transaction(async (manager) => {
      await this.lockEnvelope(manager, id);
      const envelope = await manager.getRepository(Envelope).findOne({
        where: { id },
        relations: { documents: true, recipients: true, owner: true, workspace: true },
      });
      this.assertReadable(envelope, ownerId, membership);
      if (environment && envelope.apiEnvironment !== environment) throw new NotFoundException('Enveloppe introuvable dans cet environnement.');
      if (envelope.status !== 'DRAFT')
        throw new BadRequestException('Cette enveloppe a déjà été envoyée.');
      if (envelope.expiresAt && envelope.expiresAt.getTime() <= Date.now())
        throw new BadRequestException('Cette enveloppe a expiré.');
      if (
        !envelope.documents.length ||
        !envelope.recipients.some((recipient) => recipient.role === 'SIGNER')
      )
        throw new BadRequestException(
          'Un document et un signataire sont nécessaires.',
        );
      const quotaWorkspace = await manager.getRepository(Workspace).findOneOrFail({ where: { id: membership.workspace.id }, relations: { organization: true } });
      await assertSendQuota(manager, quotaWorkspace.organization.id);
      envelope.status = 'SENT';
      await manager.save(Envelope, { id: envelope.id, status: envelope.status });
      await manager.save(AuditEvent, {
        envelope,
        actor: envelope.owner,
        actorEmail: envelope.owner.email,
        action: 'ENVELOPE_SENT',
        details: {},
      });
      return {
        envelope: this.toDto(envelope),
        invitations: envelope.recipients.map((recipient) => ({
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
          role: recipient.role,
          signingOrder: recipient.signingOrder,
          active: recipient.signingOrder === Math.min(...envelope.recipients.map((item) => item.signingOrder)),
          signingUrl: `${webOrigin}/signer/${recipient.accessToken}`,
        })),
      };
    });
    const firstOrder = Math.min(...result.invitations.map((invite) => invite.signingOrder));
    const deliveries = await Promise.all(result.invitations.filter((invite) => invite.signingOrder === firstOrder).map(async (invite) => {
      try { return { id: invite.id, email: invite.email, ...(await this.mail.sendInvitation({ to: invite.email, recipientName: invite.name, signingUrl: invite.signingUrl, envelopeTitle: result.envelope.title, expiresAt: result.envelope.expiresAt })) }; }
      catch (error) { return { id: invite.id, email: invite.email, delivered: false, reason: error instanceof Error ? error.message : 'EMAIL_FAILED' }; }
    }));
    await Promise.all(deliveries.map((delivery) => this.events.save(this.events.create({
      envelope: { id } as Envelope,
      actor: null,
      actorEmail: delivery.email,
      action: delivery.delivered ? 'INVITATION_EMAIL_SENT' : 'INVITATION_EMAIL_PENDING',
      details: delivery.delivered ? {} : { reason: delivery.reason },
    }))));
    await Promise.all(deliveries.filter((delivery) => delivery.delivered).map((delivery) => this.recipients.update(delivery.id, { lastRemindedAt: new Date() })));
    void this.webhooks.dispatch(membership.workspace.id, 'envelope.sent', { envelopeId: id, title: result.envelope.title, status: 'SENT', environment: result.envelope.apiEnvironment });
    return { ...result, deliveries };
  }

  async sendFromApi(workspaceId: string, environment: Envelope['apiEnvironment'], id: string, webOrigin: string) {
    const member = await this.workspaceMembers.findOne({ where: { workspace: { id: workspaceId }, role: 'ADMIN' }, relations: { user: true } });
    if (!member) throw new NotFoundException('Administrateur de l’espace introuvable.');
    return this.send(member.user.id, id, webOrigin, workspaceId, environment);
  }

  async remind(ownerId: string, envelopeId: string, recipientId: string, webOrigin: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    this.workspaces.requirePermission(membership.role, 'ENVELOPE_MANAGE');
    const recipient = await this.recipients.findOne({
      where: { id: recipientId, envelope: { id: envelopeId } },
      relations: { envelope: { owner: true, workspace: true, recipients: true } },
    });
    this.assertReadable(recipient?.envelope, ownerId, membership);
    if (!['SENT', 'PARTIALLY_SIGNED'].includes(recipient.envelope.status) || recipient.status !== 'WAITING') {
      throw new BadRequestException('Ce destinataire n’attend plus de réponse.');
    }
    if (recipient.envelope.expiresAt && recipient.envelope.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Cette enveloppe a expiré.');
    }
    const previousRecipient = (recipient.envelope.recipients ?? []).find(
      (item) => item.signingOrder < recipient.signingOrder && !['SIGNED', 'APPROVED'].includes(item.status),
    );
    if (previousRecipient) {
      throw new BadRequestException(`Le rappel sera disponible après la réponse de ${previousRecipient.name}.`);
    }
    const delivery = await this.mail.sendReminder({
      to: recipient.email,
      recipientName: recipient.name,
      envelopeTitle: recipient.envelope.title,
      signingUrl: `${webOrigin}/signer/${recipient.accessToken}`,
      expiresAt: recipient.envelope.expiresAt,
    });
    if (!delivery.delivered) {
      throw new BadRequestException('Le service e-mail n’est pas configuré pour envoyer les rappels.');
    }
    recipient.lastRemindedAt = new Date();
    await this.recipients.update(recipient.id, { lastRemindedAt: recipient.lastRemindedAt });
    await this.events.save(this.events.create({
      envelope: recipient.envelope,
      actor: { id: ownerId } as User,
      actorEmail: recipient.envelope.owner.email,
      action: 'REMINDER_EMAIL_SENT',
      details: { recipientId: recipient.id, recipientEmail: recipient.email, manual: true },
    }));
    return { delivered: true };
  }

  async cancel(ownerId: string, envelopeId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    this.workspaces.requirePermission(membership.role, 'ENVELOPE_MANAGE');
    return this.dataSource.transaction(async (manager) => {
      await this.lockEnvelope(manager, envelopeId);
      const envelope = await manager.getRepository(Envelope).findOne({
        where: { id: envelopeId },
        relations: { owner: true, workspace: true, recipients: true },
      });
      this.assertReadable(envelope, ownerId, membership);
      if (await this.expireEnvelopeIfPast(envelope, manager)) {
        throw new BadRequestException('Cette enveloppe a expiré.');
      }
      if (!['SENT', 'PARTIALLY_SIGNED'].includes(envelope.status)) {
        throw new BadRequestException('Seule une enveloppe envoyée ou en cours peut être annulée.');
      }
      envelope.status = 'VOIDED';
      await manager.save(Envelope, { id: envelope.id, status: envelope.status });
      await manager.save(AuditEvent, {
        envelope,
        actor: envelope.owner,
        actorEmail: envelope.owner.email,
        action: 'ENVELOPE_VOIDED',
        details: { reason: 'Annulée par le propriétaire' },
      });
      return { status: envelope.status };
    });
  }

  async getPublicInvitation(token: string) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { documents: true, recipients: true } },
    });
    if (!recipient) throw new NotFoundException('Invitation introuvable ou déjà traitée.');
    if (await this.expireEnvelopeIfPast(recipient.envelope)) {
      throw new BadRequestException('Cette invitation a expiré.');
    }
    if (
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED' ||
      ['VOIDED', 'COMPLETED'].includes(recipient.envelope.status) ||
      ['SIGNED', 'APPROVED'].includes(recipient.status)
    )
      throw new NotFoundException('Invitation introuvable ou déjà traitée.');
    this.assertRecipientStepIsActive(recipient);
    if (!recipient.viewedAt) {
      recipient.viewedAt = new Date();
      await this.recipients.update(recipient.id, { viewedAt: recipient.viewedAt });
      await this.events.save(this.events.create({ envelope: recipient.envelope, actor: null, actorEmail: recipient.email, action: 'INVITATION_VIEWED', details: {} }));
    }
    return {
      recipient: {
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
        authenticationMethod: recipient.authenticationMethod,
      },
      envelope: {
        id: recipient.envelope.id,
        title: recipient.envelope.title,
        message: recipient.envelope.message,
        status: recipient.envelope.status,
        allowDecline: recipient.envelope.allowDecline,
        expiresAt: recipient.envelope.expiresAt,
        branding: recipient.envelope.brandSnapshot,
        signatureLevel: recipient.signatureLevel,
        cryptographicPdfEnabled: Boolean(process.env.SIGNING_P12_PATH && process.env.SIGNING_P12_PASSWORD),
      },
      collectionRequests: (recipient.envelope.collectionRequests ?? [])
        .filter((item) => item.recipientEmail === recipient.email)
        .map(({ id, label, required }) => ({ id, label, required })),
      collectionFiles: (recipient.collectionFiles ?? []).map(
        ({ requestId, originalName }) => ({ requestId, name: originalName }),
      ),
      documents: this.orderedDocuments(recipient.envelope).map(
        (document, documentIndex) => ({
          id: document.id,
          name: document.originalName,
          mimeType: document.mimeType,
          url: `/envelopes/public/${token}/documents/${document.id}`,
          fields:
            recipient.role === 'SIGNER'
              ? [
                  ...(recipient.envelope.fields ?? []),
                  ...(recipient.envelope.legacyTextFields ?? []).map(
                    (field) => ({
                      id: field.id,
                      type: 'TEXT' as const,
                      documentIndex: field.documentIndex,
                      pageNumber: field.pageNumber,
                      x: field.x,
                      y: field.y,
                      label: 'Saisie de texte',
                      options: undefined,
                      recipientEmail: undefined,
                      fontFamily: 'SANS' as const,
                      fontSize: 11,
                      fontColor: '#24352b',
                    }),
                  ),
                ]
                  .filter(
                    (field) =>
                      field.documentIndex === documentIndex &&
                      (!field.recipientEmail ||
                        field.recipientEmail === recipient.email),
                  )
                  .map((field) => ({ ...field }))
                  .map(({ id, type, pageNumber, x, y, label, options, fontFamily, fontSize, fontColor, ...presentation }) => ({
                    id,
                    type,
                    pageNumber,
                    x,
                    y,
                    label,
                    options,
                    fontFamily,
                    fontSize,
                    fontColor,
                    signatureDisplay: 'signatureDisplay' in presentation ? presentation.signatureDisplay : 'MINIMAL',
                    dateValue: 'dateValue' in presentation ? presentation.dateValue : undefined,
                    width: 'width' in presentation ? presentation.width : undefined,
                    height: 'height' in presentation ? presentation.height : undefined,
                  }))
              : [],
        }),
      ).filter((document) => this.canViewDocument(recipient.envelope, recipient.email, document.id)),
    };
  }

  async uploadCollection(
    token: string,
    requestId: string,
    file?: UploadedFile,
  ) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { recipients: true } },
    });
    if (!recipient) {
      throw new NotFoundException('Cette invitation n’est plus disponible.');
    }
    if (await this.expireEnvelopeIfPast(recipient.envelope)) {
      throw new BadRequestException('Cette invitation a expiré.');
    }
    if (
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED' ||
      ['VOIDED', 'COMPLETED'].includes(recipient.envelope.status) ||
      ['SIGNED', 'APPROVED', 'DECLINED'].includes(recipient.status)
    ) {
      throw new NotFoundException('Cette invitation n’est plus disponible.');
    }
    this.assertRecipientStepIsActive(recipient);
    const request = (recipient.envelope.collectionRequests ?? []).find(
      (item) =>
        item.id === requestId && item.recipientEmail === recipient.email,
    );
    if (!request) throw new NotFoundException('Document demandé introuvable.');
    if (!file) throw new BadRequestException('Sélectionnez un fichier.');
    this.validateFile(file);
    const storageName = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await mkdir(this.uploadDirectory, { recursive: true });
    await writeFile(join(this.uploadDirectory, storageName), file.buffer, {
      flag: 'wx',
    });
    recipient.collectionFiles = [
      ...(recipient.collectionFiles ?? []).filter(
        (item) => item.requestId !== requestId,
      ),
      {
        requestId,
        originalName: file.originalname.slice(0, 255),
        storageName,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      },
    ];
    await this.recipients.update(recipient.id, { collectionFiles: recipient.collectionFiles });
    await this.events.save(
      this.events.create({
        envelope: recipient.envelope,
        actor: null,
        actorEmail: recipient.email,
        action: 'COLLECTION_DOCUMENT_UPLOADED',
        details: { requestId, originalName: file.originalname },
      }),
    );
    return { requestId, name: file.originalname, uploaded: true };
  }

  async publicDocument(token: string, documentId: string) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { documents: true, recipients: true } },
    });
    if (!recipient) throw new NotFoundException('Invitation introuvable.');
    if (await this.expireEnvelopeIfPast(recipient.envelope)) {
      throw new BadRequestException('Cette invitation a expiré.');
    }
    if (
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED' ||
      ['VOIDED', 'COMPLETED'].includes(recipient.envelope.status)
    )
      throw new NotFoundException('Invitation introuvable.');
    this.assertRecipientStepIsActive(recipient);
    const document = recipient.envelope.documents.find(
      (item) => item.id === documentId,
    );
    if (!document || !this.canViewDocument(recipient.envelope, recipient.email, document.id)) throw new NotFoundException('Document introuvable.');
    return { document, path: join(this.uploadDirectory, document.storageName) };
  }

  async signedDocument(ownerId: string, envelopeId: string, documentId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const document = await this.documents.findOne({
      where: { id: documentId, envelope: { id: envelopeId } },
      relations: { envelope: { owner: true, workspace: true } },
    });
    this.assertReadable(document?.envelope, ownerId, membership);
    const storageName = document?.signedStorageName ?? document?.finalStorageName;
    if (!document || !storageName) throw new NotFoundException('Le PDF final n’est pas encore disponible.');
    return { document, path: join(this.uploadDirectory, storageName) };
  }

  async auditTrail(ownerId: string, envelopeId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    const envelope = await this.envelopes.findOne({ where: { id: envelopeId }, relations: { recipients: true, events: true, documents: true, owner: true, workspace: true } });
    this.assertReadable(envelope, ownerId, membership);
    return {
      envelope: { id: envelope.id, title: envelope.title, status: envelope.status, createdAt: envelope.createdAt, expiresAt: envelope.expiresAt },
      recipients: envelope.recipients.map((recipient) => ({ name: recipient.name, email: recipient.email, role: recipient.role, status: recipient.status, viewedAt: recipient.viewedAt, signedAt: recipient.signedAt })),
      documents: this.orderedDocuments(envelope).map((document) => ({ name: document.originalName, checksum: document.checksum, finalPdfAvailable: Boolean(document.finalStorageName), signedPdfAvailable: Boolean(document.signedStorageName) })),
      events: envelope.events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((event) => ({ action: event.action, actorEmail: event.actorEmail, createdAt: event.createdAt, details: event.details })),
      generatedAt: new Date().toISOString(),
    };
  }

  async evidenceBundle(ownerId: string, envelopeId: string) {
    const membership = await this.workspaces.activeForUser(ownerId);
    let envelope = await this.envelopes.findOne({ where: { id: envelopeId }, relations: { documents: true, recipients: true, events: true, owner: true, workspace: true } });
    this.assertReadable(envelope, ownerId, membership);
    if (envelope.status !== 'COMPLETED') throw new BadRequestException('Le dossier de preuve est disponible une fois l’enveloppe terminée.');
    await this.createCompletedPdfs(envelope);
    envelope = await this.envelopes.findOneOrFail({ where: { id: envelopeId }, relations: { documents: true, recipients: true, events: true, owner: true, workspace: true } });
    const audit = await this.auditTrail(ownerId, envelopeId);
    const entries: { name: string; data: Buffer }[] = [{ name: 'journal-de-preuve.json', data: Buffer.from(JSON.stringify(audit, null, 2), 'utf8') }];
    for (const [index, document] of this.orderedDocuments(envelope).entries()) {
      const storageName = document.signedStorageName ?? document.finalStorageName;
      if (!storageName) continue;
      const safeName = document.originalName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `document-${index + 1}.pdf`;
      entries.push({ name: `documents/${String(index + 1).padStart(2, '0')}-${safeName.replace(/\.pdf$/i, '')}-final.pdf`, data: await readFile(join(this.uploadDirectory, storageName)) });
    }
    return { buffer: createEvidenceZip(entries), filename: `dossier-de-preuve-${envelope.id}.zip` };
  }

  async requestEmailOtp(token: string) {
    const recipient = await this.recipients.findOne({ where: { accessToken: token }, relations: { envelope: { recipients: true } } });
    if (!recipient || !['SENT', 'PARTIALLY_SIGNED'].includes(recipient.envelope.status) || recipient.authenticationMethod !== 'EMAIL_OTP' || ['SIGNED', 'APPROVED', 'DECLINED'].includes(recipient.status)) throw new NotFoundException('Vérification indisponible pour cette invitation.');
    if (await this.expireEnvelopeIfPast(recipient.envelope)) {
      throw new BadRequestException('Cette invitation a expiré.');
    }
    this.assertRecipientStepIsActive(recipient);
    const code = randomInt(100000, 1_000_000).toString();
    recipient.otpHash = await hash(code, 10); recipient.otpExpiresAt = new Date(Date.now() + 10 * 60_000); recipient.otpVerifiedAt = null; recipient.otpAttempts = 0;
    await this.recipients.update(recipient.id, { otpHash: recipient.otpHash, otpExpiresAt: recipient.otpExpiresAt, otpVerifiedAt: null, otpAttempts: 0 });
    const delivery = await this.mail.sendOtp(recipient.email, recipient.name, recipient.envelope.title, code);
    if (!delivery.delivered) throw new BadRequestException('Le service e-mail n’est pas configuré pour envoyer le code.');
    await this.events.save(this.events.create({ envelope: recipient.envelope, actor: null, actorEmail: recipient.email, action: 'EMAIL_OTP_SENT', details: { expiresAt: recipient.otpExpiresAt.toISOString() } }));
    return { sent: true, expiresAt: recipient.otpExpiresAt };
  }

  async sign(
    token: string,
    signatureName: string,
    consent: boolean,
    fieldValues: Record<string, string> = {},
    otpCode?: string,
  ) {
    if (!signatureName?.trim() || !consent)
      throw new BadRequestException(
        'Confirmez votre nom et votre accord avant de signer.',
      );
    const result = await this.dataSource.transaction(async (manager) => {
      await this.lockInvitationEnvelope(manager, token);
      const recipient = await manager.getRepository(Recipient).findOne({
        where: { accessToken: token },
        relations: { envelope: { recipients: true, documents: true } },
      });
      if (recipient && await this.expireEnvelopeIfPast(recipient.envelope, manager)) {
        throw new BadRequestException('Cette invitation a expiré.');
      }
      if (
        !recipient ||
        recipient.envelope.status === 'DRAFT' ||
        recipient.envelope.status === 'EXPIRED' ||
        ['VOIDED', 'COMPLETED'].includes(recipient.envelope.status) ||
        ['SIGNED', 'APPROVED'].includes(recipient.status)
      )
        throw new NotFoundException('Invitation introuvable ou déjà traitée.');
      if (recipient.authenticationMethod === 'EMAIL_OTP' && !recipient.otpVerifiedAt) {
        if (!recipient.otpHash || !recipient.otpExpiresAt || recipient.otpExpiresAt.getTime() < Date.now() || recipient.otpAttempts >= 5 || !otpCode || !(await compare(otpCode, recipient.otpHash))) {
          recipient.otpAttempts += 1; await manager.save(recipient);
          throw new BadRequestException('Saisissez un code e-mail valide, reçu il y a moins de 10 minutes.');
        }
        recipient.otpVerifiedAt = new Date(); recipient.otpHash = null; await manager.save(recipient);
      }
      if (
        recipient.envelope.expiresAt &&
        recipient.envelope.expiresAt.getTime() < Date.now()
      ) {
        recipient.envelope.status = 'EXPIRED';
        await manager.save(Envelope, { id: recipient.envelope.id, status: recipient.envelope.status });
        throw new BadRequestException('Cette invitation a expiré.');
      }
      this.assertRecipientStepIsActive(recipient);
      const envelopeFields = (recipient.envelope.fields ?? []).filter(
        (field) =>
          !field.recipientEmail || field.recipientEmail === recipient.email,
      );
      const requiredCollections = (
        recipient.envelope.collectionRequests ?? []
      ).filter(
        (item) => item.required && item.recipientEmail === recipient.email,
      );
      for (const field of envelopeFields) {
        if (field.type === 'SIGN_DATE' && fieldValues[field.id] !== undefined && !isCalendarDate(fieldValues[field.id]))
          throw new BadRequestException('Sélectionnez une date valide dans le calendrier.');
        const signatureImage = field.type === 'SIGNATURE' ? fieldValues[field.id] : undefined;
        if (signatureImage?.startsWith('data:image/png;base64,')) {
          const encoded = signatureImage.slice('data:image/png;base64,'.length);
          const image = Buffer.from(encoded, 'base64');
          if (
            encoded.length > 180_000 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
            image.length < 24 ||
            image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
            image.readUInt32BE(16) > 1200 ||
            image.readUInt32BE(20) > 300 ||
            image.readUInt32BE(16) === 0 ||
            image.readUInt32BE(20) === 0
          ) {
            throw new BadRequestException('Le fichier de signature dessinée est invalide ou trop volumineux.');
          }
        }
      }
      if (
        requiredCollections.some(
          (request) =>
            !(recipient.collectionFiles ?? []).some(
              (file) => file.requestId === request.id,
            ),
        )
      ) {
        throw new BadRequestException(
          'Téléversez tous les documents demandés avant de continuer.',
        );
      }
      const missingField =
        recipient.role === 'SIGNER'
          ? envelopeFields.find((field) => {
              if (
                field.type === 'SIGN_DATE' ||
                field.type === 'SIGNER_NAME' ||
                field.type === 'SIGNER_EMAIL' ||
                field.type === 'READ_ONLY_TEXT'
              )
                return false;
              if (field.type === 'CHECKBOX')
                return fieldValues[field.id] !== 'true';
              if (field.type === 'RADIO')
                return !field.options?.includes(fieldValues[field.id] ?? '');
              return !(
                field.type === 'SIGNATURE'
                  ? signatureName
                  : fieldValues[field.id]
              )?.trim();
            })
          : undefined;
      if (missingField)
        throw new BadRequestException(
          'Complétez tous les champs texte avant de continuer.',
        );
      const previousRecipient = (recipient.envelope.recipients ?? []).find(
        (item) =>
          item.signingOrder < recipient.signingOrder &&
          !['SIGNED', 'APPROVED'].includes(item.status),
      );
      if (previousRecipient)
        throw new BadRequestException(
          `La demande doit d’abord être traitée par ${previousRecipient.name}.`,
        );
      recipient.status = recipient.role === 'APPROVER' ? 'APPROVED' : 'SIGNED';
      recipient.signedAt = new Date();
      const completedFieldValues = { ...fieldValues };
      for (const field of envelopeFields) {
        if (field.type === 'SIGNATURE')
          completedFieldValues[field.id] = fieldValues[field.id]?.startsWith('data:image/png;base64,')
            ? fieldValues[field.id]
            : signatureName.trim();
        if (field.type === 'SIGN_DATE')
          completedFieldValues[field.id] = fieldValues[field.id] ?? field.dateValue ?? recipient.signedAt.toISOString().slice(0, 10);
        if (field.type === 'SIGNER_NAME')
          completedFieldValues[field.id] = recipient.name;
        if (field.type === 'SIGNER_EMAIL')
          completedFieldValues[field.id] = recipient.email;
        if (field.type === 'READ_ONLY_TEXT')
          completedFieldValues[field.id] = field.label;
      }
      await manager.save(recipient);
      const allCompleted = recipient.envelope.recipients.every((item) =>
        item.id === recipient.id || ['SIGNED', 'APPROVED'].includes(item.status),
      );
      recipient.envelope.status = allCompleted
        ? 'COMPLETED'
        : 'PARTIALLY_SIGNED';
      await manager.save(Envelope, { id: recipient.envelope.id, status: recipient.envelope.status });
      await manager.save(AuditEvent, {
        envelope: recipient.envelope,
        actor: null,
        actorEmail: recipient.email,
        action:
          recipient.role === 'APPROVER'
            ? 'ENVELOPE_APPROVED'
            : 'DOCUMENT_SIGNED',
        details: {
          recipientId: recipient.id,
          signatureName: signatureName.trim(),
          authenticationMethod: recipient.authenticationMethod,
          otpVerifiedAt: recipient.otpVerifiedAt?.toISOString(),
          fieldValues: completedFieldValues,
        },
      });
      return {
        status: recipient.envelope.status,
        signedAt: recipient.signedAt,
        envelopeId: recipient.envelope.id,
      };
    });
    if (result.status === 'COMPLETED') {
      const completedEnvelope = await this.envelopes.findOne({
        where: { id: result.envelopeId },
        relations: { documents: true, recipients: true, owner: true, workspace: true },
      });
      if (completedEnvelope) {
        try { await this.createCompletedPdfs(completedEnvelope); }
        catch (error) { console.error('PDF final generation failed:', error instanceof Error ? error.message : 'Unknown error'); }
        if (completedEnvelope.workspace) void this.webhooks.dispatch(completedEnvelope.workspace.id, 'envelope.completed', { envelopeId: completedEnvelope.id, title: completedEnvelope.title, status: completedEnvelope.status, environment: completedEnvelope.apiEnvironment });
        try {
          const delivery = await this.mail.sendCompletionNotice(completedEnvelope.owner.email, completedEnvelope.title);
          await this.events.save(this.events.create({ envelope: completedEnvelope, actor: null, actorEmail: completedEnvelope.owner.email, action: delivery.delivered ? 'COMPLETION_EMAIL_SENT' : 'COMPLETION_EMAIL_PENDING', details: delivery.delivered ? {} : { reason: delivery.reason } }));
        } catch (error) { console.error('Completion email failed:', error); }
      }
    } else {
      await this.dataSource.transaction(async (manager) => {
        await this.lockEnvelope(manager, result.envelopeId);
        const pendingEnvelope = await manager.getRepository(Envelope).findOne({
          where: { id: result.envelopeId },
          relations: { recipients: true, owner: true },
        });
        if (pendingEnvelope && ['SENT', 'PARTIALLY_SIGNED'].includes(pendingEnvelope.status) && !(await this.expireEnvelopeIfPast(pendingEnvelope, manager))) {
          const waiting = pendingEnvelope.recipients.filter((item) => item.status === 'WAITING');
          const nextOrder = Math.min(...waiting.map((item) => item.signingOrder));
          const newlyActive = waiting.filter((item) => item.signingOrder === nextOrder && !item.lastRemindedAt);
          for (const nextRecipient of newlyActive) {
            try {
              const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
              const delivery = await this.mail.sendInvitation({
                to: nextRecipient.email,
                recipientName: nextRecipient.name,
                envelopeTitle: pendingEnvelope.title,
                signingUrl: `${webOrigin}/signer/${nextRecipient.accessToken}`,
                expiresAt: pendingEnvelope.expiresAt,
              });
              if (!delivery.delivered) continue;
              nextRecipient.lastRemindedAt = new Date();
              await manager.getRepository(Recipient).update(nextRecipient.id, { lastRemindedAt: nextRecipient.lastRemindedAt });
              await manager.save(AuditEvent, {
                envelope: pendingEnvelope,
                actor: null,
                actorEmail: nextRecipient.email,
                action: 'INVITATION_EMAIL_SENT',
                details: { sequentialStep: nextOrder },
              });
            } catch (error) {
              console.error('Next sequential invitation email failed:', error);
            }
          }
        }
      });
    }
    return result;
  }

  async decline(token: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockInvitationEnvelope(manager, token);
      const recipient = await manager.getRepository(Recipient).findOne({
        where: { accessToken: token },
        relations: { envelope: { recipients: true } },
      });
      if (recipient && await this.expireEnvelopeIfPast(recipient.envelope, manager)) {
        throw new BadRequestException('Cette invitation a expiré.');
      }
      if (
        !recipient ||
        recipient.envelope.status === 'DRAFT' ||
        recipient.envelope.status === 'EXPIRED' ||
        ['VOIDED', 'COMPLETED'].includes(recipient.envelope.status) ||
        ['SIGNED', 'APPROVED', 'DECLINED'].includes(recipient.status)
      ) {
        throw new NotFoundException('Invitation introuvable ou déjà traitée.');
      }
      if (!recipient.envelope.allowDecline) {
        throw new BadRequestException(
          'Le refus de signature n’est pas autorisé pour cette invitation.',
        );
      }
      this.assertRecipientStepIsActive(recipient);
      if (
        recipient.envelope.expiresAt &&
        recipient.envelope.expiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException('Cette invitation a expiré.');
      }
      recipient.status = 'DECLINED';
      recipient.envelope.status = 'VOIDED';
      await manager.save(recipient);
      await manager.save(Envelope, { id: recipient.envelope.id, status: recipient.envelope.status });
      await manager.save(AuditEvent, {
        envelope: recipient.envelope,
        actor: null,
        actorEmail: recipient.email,
        action: 'SIGNATURE_DECLINED',
        details: { reason: reason.slice(0, 500) },
      });
      return { status: recipient.envelope.status };
    });
  }

  private validateFile(file: UploadedFile) {
    const extension = extname(file.originalname).toLowerCase();
    const isPdf =
      extension === '.pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
    const isDocx =
      extension === '.docx' &&
      file.buffer[0] === 0x50 &&
      file.buffer[1] === 0x4b;
    if (!isPdf && !isDocx)
      throw new BadRequestException(
        `${file.originalname} doit être un PDF ou un DOCX valide.`,
      );
    if (file.size > 50 * 1024 * 1024)
      throw new BadRequestException(
        'Chaque document doit faire 50 Mo maximum.',
      );
  }

  private assertReadable(
    envelope: Envelope | null | undefined,
    userId: string,
    membership: WorkspaceMember,
    message = 'Enveloppe introuvable.',
  ): asserts envelope is Envelope {
    if (!envelope) throw new NotFoundException(message);
    const workspaceId = envelope.workspace?.id;
    if (workspaceId ? workspaceId !== membership.workspace.id : envelope.owner?.id !== userId) {
      throw new NotFoundException(message);
    }
  }

  private toDto(envelope: Envelope) {
    return {
      id: envelope.id,
      title: envelope.title,
      message: envelope.message,
      status: envelope.status,
      apiEnvironment: envelope.apiEnvironment,
      createdAt: envelope.createdAt,
      expiresAt: envelope.expiresAt,
      preparationSettings: envelope.preparationSettings,
      cryptographicPdfEnabled: Boolean(process.env.SIGNING_P12_PATH && process.env.SIGNING_P12_PASSWORD),
      documents: this.orderedDocuments(envelope).map((document) => ({
        id: document.id,
        name: document.originalName,
        mimeType: document.mimeType,
        size: Number(document.size),
        finalPdfAvailable: Boolean(document.finalStorageName),
        signedPdfAvailable: Boolean(document.signedStorageName),
      })),
      fields: envelope.fields ?? [],
      recipients: (envelope.recipients ?? []).map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
        viewedAt: recipient.viewedAt,
        lastRemindedAt: recipient.lastRemindedAt,
        signingOrder: recipient.signingOrder,
        signatureLevel: recipient.signatureLevel,
        authenticationMethod: recipient.authenticationMethod,
        collectionFiles: (recipient.collectionFiles ?? []).map(
          ({ requestId, originalName, uploadedAt }) => ({
            requestId,
            name: originalName,
            uploadedAt,
          }),
        ),
      })),
    };
  }

  private async createCompletedPdfs(envelope: Envelope) {
    await this.createFinalPdfs(envelope);
    await this.createCryptographicallySignedPdfs(envelope);
  }

  private async createFinalPdfs(envelope: Envelope) {
    const audit = await this.events.find({ where: { envelope: { id: envelope.id }, action: 'DOCUMENT_SIGNED' }, order: { createdAt: 'ASC' } });
    for (const [documentIndex, document] of this.orderedDocuments(envelope).entries()) {
      if (document.finalStorageName || (!document.mimeType.includes('pdf') && !document.originalName.toLowerCase().endsWith('.pdf'))) continue;
      const pdf = await PDFDocument.load(await readFile(join(this.uploadDirectory, document.storageName)));
      const defaultFont = await pdf.embedFont(StandardFonts.Helvetica);
      for (const event of audit) {
        const values = (event.details?.fieldValues ?? {}) as Record<string, string>;
        for (const field of (envelope.fields ?? []).filter((item) => item.documentIndex === documentIndex)) {
          const value = values[field.id];
          if (!value || field.type === 'CHECKBOX' && value !== 'true') continue;
          const page = pdf.getPage(field.pageNumber - 1);
          if (!page) continue;
          const x = (field.x / 100) * page.getWidth();
          const y = page.getHeight() - (field.y / 100) * page.getHeight() - 14;
          if (field.type === 'SIGNATURE' && value.startsWith('data:image/png;base64,')) {
            const image = await pdf.embedPng(Buffer.from(value.slice('data:image/png;base64,'.length), 'base64'));
            const width = page.getWidth() * (field.width ?? 30) / 100;
            const height = page.getHeight() * (field.height ?? 9) / 100;
            page.drawImage(image, { x, y: y - height + 14, width, height });
            if (field.signatureDisplay === 'DETAILED') {
              page.drawText(`Signe le ${event.createdAt.toLocaleDateString('fr-FR')} - ${event.actorEmail}`, { x, y: y - height - 2, size: 7, font: defaultFont, maxWidth: width });
            }
            continue;
          }
          const label = field.type === 'CHECKBOX' ? '[x] ' + field.label : field.type === 'SIGN_DATE' && isCalendarDate(value) ? value.split('-').reverse().join('/') : value;
          const family = field.fontFamily ?? 'SANS';
          const chosenFont = family === 'SCRIPT' ? StandardFonts.TimesRomanItalic : family === 'SERIF' ? StandardFonts.TimesRoman : family === 'MONO' ? StandardFonts.Courier : StandardFonts.Helvetica;
          const fieldFont = family === 'SANS' ? defaultFont : await pdf.embedFont(chosenFont);
          const hex = field.fontColor ?? '#24352b';
          const color = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
          page.drawText(label.slice(0, 200), { x, y, size: field.fontSize ?? 11, font: fieldFont, color, maxWidth: page.getWidth() * (field.width ?? 55) / 100 });
          if (field.type === 'SIGNATURE' && field.signatureDisplay === 'DETAILED') page.drawText(`Signe le ${event.createdAt.toLocaleDateString('fr-FR')} - ${event.actorEmail}`, { x, y: y - 13, size: 7, font: defaultFont, color, maxWidth: page.getWidth() * (field.width ?? 35) / 100 });
        }
      }
      const finalStorageName = `${randomUUID()}-final.pdf`;
      await writeFile(join(this.uploadDirectory, finalStorageName), await pdf.save(), { flag: 'wx' });
      document.finalStorageName = finalStorageName;
      await this.documents.save(document);
    }
  }

  private async createCryptographicallySignedPdfs(envelope: Envelope) {
    const certPath = process.env.SIGNING_P12_PATH;
    const certPassword = process.env.SIGNING_P12_PASSWORD;
    if (!certPath || !certPassword) return;
    const p12 = await readFile(resolve(certPath));
    const audit = await this.events.find({
      where: { envelope: { id: envelope.id }, action: 'DOCUMENT_SIGNED' },
      order: { createdAt: 'ASC' },
    });
    for (const [documentIndex, document] of this.orderedDocuments(envelope).entries()) {
      if (document.signedStorageName) continue;
      if (!document.mimeType.includes('pdf') && !document.originalName.toLowerCase().endsWith('.pdf')) continue;
      const source = await readFile(join(this.uploadDirectory, document.storageName));
      const pdf = await PDFDocument.load(source);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const event of audit) {
        const values = (event.details?.fieldValues ?? {}) as Record<string, string>;
        const fields = (envelope.fields ?? []).filter((field) => field.documentIndex === documentIndex);
        for (const field of fields) {
          const value = values[field.id];
          if (!value || field.type === 'CHECKBOX' && value !== 'true') continue;
          const page = pdf.getPage(field.pageNumber - 1);
          if (!page) continue;
          const x = (field.x / 100) * page.getWidth();
          const y = page.getHeight() - (field.y / 100) * page.getHeight() - 14;
          if (field.type === 'SIGNATURE' && value.startsWith('data:image/png;base64,')) {
            const image = await pdf.embedPng(Buffer.from(value.slice('data:image/png;base64,'.length), 'base64'));
            const width = page.getWidth() * (field.width ?? 30) / 100;
            const height = page.getHeight() * (field.height ?? 9) / 100;
            page.drawImage(image, { x, y: y - height + 14, width, height });
            if (field.signatureDisplay === 'DETAILED') {
              page.drawText(`Signe le ${event.createdAt.toLocaleDateString('fr-FR')} - ${event.actorEmail}`, { x, y: y - height - 2, size: 7, font, maxWidth: width });
            }
            continue;
          }
          const label = field.type === 'CHECKBOX' ? '[x] ' + field.label : field.type === 'SIGN_DATE' && isCalendarDate(value) ? value.split('-').reverse().join('/') : value;
          const family = field.fontFamily ?? 'SANS';
          const chosenFont = family === 'SCRIPT' ? StandardFonts.TimesRomanItalic : family === 'SERIF' ? StandardFonts.TimesRoman : family === 'MONO' ? StandardFonts.Courier : StandardFonts.Helvetica;
          const fieldFont = family === 'SANS' ? font : await pdf.embedFont(chosenFont);
          const hex = field.fontColor ?? '#24352b';
          const fieldColor = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
          page.drawText(label.slice(0, 200), { x, y, size: field.fontSize ?? 11, font: fieldFont, color: fieldColor, maxWidth: page.getWidth() * (field.width ?? 55) / 100 });
          if (field.type === 'SIGNATURE' && field.signatureDisplay === 'DETAILED') {
            page.drawText(`Signe le ${event.createdAt.toLocaleDateString('fr-FR')} - ${event.actorEmail}`, { x, y: y - 13, size: 7, font, color: fieldColor, maxWidth: page.getWidth() * (field.width ?? 35) / 100 });
          }
        }
      }
      const page = pdf.getPage(0);
      pdflibAddPlaceholder({
        pdfDoc: pdf,
        pdfPage: page,
        reason: `Signeo - enveloppe ${envelope.id}`,
        name: process.env.SIGNING_CERT_NAME || envelope.brandSnapshot?.displayName || 'Signeo',
        location: 'Signature électronique',
        contactInfo: 'Signature numérique de document',
        subFilter: SUBFILTER_ETSI_CADES_DETACHED,
        signatureLength: 16000,
        widgetRect: [0, 0, 0, 0],
      });
      const prepared = Buffer.from(await pdf.save({ useObjectStreams: false }));
      const signed = await new SignPdf().sign(prepared, new P12Signer(p12, { passphrase: certPassword }));
      const signedStorageName = `${randomUUID()}-signed.pdf`;
      await writeFile(join(this.uploadDirectory, signedStorageName), signed, { flag: 'wx' });
      document.signedStorageName = signedStorageName;
      await this.documents.save(document);
    }
  }

  private orderedDocuments(envelope: Envelope) {
    const order = envelope.preparationSettings?.documentOrder;
    return [...(envelope.documents ?? [])].sort((a, b) => order
      ? order.indexOf(a.storageName) - order.indexOf(b.storageName)
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  private canViewDocument(envelope: Envelope, email: string, documentId: string) {
    const index = this.orderedDocuments(envelope).findIndex((document) => document.id === documentId);
    const visibility = envelope.preparationSettings?.documentVisibility;
    return index >= 0 && (!visibility || Boolean(visibility[index]?.includes(email)));
  }

  private assertRecipientStepIsActive(recipient: Recipient) {
    const previousRecipient = (recipient.envelope.recipients ?? []).find(
      (item) => item.signingOrder < recipient.signingOrder && !['SIGNED', 'APPROVED'].includes(item.status),
    );
    if (previousRecipient) {
      throw new BadRequestException(`Cette invitation sera disponible après la réponse de ${previousRecipient.name}.`);
    }
  }

  // Lock only the parent row: PostgreSQL cannot FOR UPDATE nullable outer joins.
  // Every status transition takes this lock before reloading recipients.
  private async lockEnvelope(manager: EntityManager, id: string) {
    await manager.getRepository(Envelope).findOne({
      where: { id }, lock: { mode: 'pessimistic_write' },
    });
  }

  private async lockInvitationEnvelope(manager: EntityManager, token: string) {
    const invitation = await manager.getRepository(Recipient).findOne({
      where: { accessToken: token }, relations: { envelope: true },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable.');
    await this.lockEnvelope(manager, invitation.envelope.id);
  }

  private async expireEnvelopeIfPast(
    envelope: Envelope,
    manager?: { getRepository(target: typeof Envelope): Repository<Envelope> },
  ) {
    if (!envelope.expiresAt || envelope.expiresAt.getTime() > Date.now()) return false;
    // Callers inside a transaction reject the action. Do not write an audit event
    // outside a transaction that will be rolled back by that rejection.
    if (manager) return true;
    const changed = await this.envelopes.update(
      { id: envelope.id, status: In(['SENT', 'PARTIALLY_SIGNED']) },
      { status: 'EXPIRED' },
    );
    if (changed.affected) {
      envelope.status = 'EXPIRED';
      await this.events.save(this.events.create({
        envelope, actor: null, actorEmail: null, action: 'ENVELOPE_EXPIRED',
        details: { expiresAt: envelope.expiresAt.toISOString() },
      }));
    }
    return true;
  }

  @Cron('0 9 * * *')
  async sendDailyReminders() {
    const now = Date.now();
    const expired = await this.envelopes.find({
      where: [
        { status: 'SENT', expiresAt: LessThan(new Date(now)) },
        { status: 'PARTIALLY_SIGNED', expiresAt: LessThan(new Date(now)) },
      ],
      relations: { owner: true },
    });
    for (const envelope of expired) {
      await this.expireEnvelopeIfPast(envelope);
    }
    const pending = await this.recipients.find({
      where: [
        { status: 'WAITING', envelope: { status: 'SENT' } },
        { status: 'WAITING', envelope: { status: 'PARTIALLY_SIGNED' } },
      ],
      relations: { envelope: true },
    });
    for (const recipient of pending) {
      if (recipient.lastRemindedAt && now - recipient.lastRemindedAt.getTime() < 3 * 24 * 60 * 60 * 1000) continue;
      if (recipient.envelope.expiresAt && recipient.envelope.expiresAt.getTime() < now) continue;
      const previousRecipients = await this.recipients.find({
        where: { envelope: { id: recipient.envelope.id }, signingOrder: LessThan(recipient.signingOrder) },
      });
      if (previousRecipients.some((item) => !['SIGNED', 'APPROVED'].includes(item.status))) continue;
      const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      try {
        const delivery = await this.mail.sendReminder({ to: recipient.email, recipientName: recipient.name, envelopeTitle: recipient.envelope.title, signingUrl: `${origin}/signer/${recipient.accessToken}`, expiresAt: recipient.envelope.expiresAt });
        if (!delivery.delivered) continue;
        recipient.lastRemindedAt = new Date();
        await this.recipients.update(recipient.id, { lastRemindedAt: recipient.lastRemindedAt });
        await this.events.save(this.events.create({ envelope: recipient.envelope, actor: null, actorEmail: recipient.email, action: 'REMINDER_EMAIL_SENT', details: {} }));
      } catch (error) { console.error('Reminder email failed:', error); }
    }
  }
}
import { assertSendQuota } from '../billing/quotas.js';
import { Workspace } from '../workspaces/workspace.entity.js';

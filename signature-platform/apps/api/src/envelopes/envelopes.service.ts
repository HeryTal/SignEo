import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import {
  Envelope,
  EnvelopeCollectionRequest,
  EnvelopeField,
} from './envelope.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { Recipient } from './recipient.entity.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';

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
    @InjectRepository(Recipient)
    private readonly recipients: Repository<Recipient>,
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
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
  ) {
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
    for (const recipient of recipientsInput) {
      if (!['SIMPLE', 'ADVANCED', 'QUALIFIED'].includes(recipient.signatureLevel ?? 'SIMPLE'))
        throw new BadRequestException('Niveau de signature invalide.');
      if (!['NONE', 'EMAIL_OTP', 'SMS_OTP'].includes(recipient.authenticationMethod ?? 'NONE'))
        throw new BadRequestException('Méthode d’authentification invalide.');
      if ((recipient.signatureLevel ?? 'SIMPLE') !== 'SIMPLE')
        throw new BadRequestException('Les niveaux avancé et qualifié nécessitent un prestataire de confiance. Choisissez SIMPLE jusqu’à sa configuration.');
      if (recipient.authenticationMethod && recipient.authenticationMethod !== 'NONE')
        throw new BadRequestException('La vérification OTP nécessite un fournisseur e-mail ou SMS configuré.');
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
        expiresAt: expiration,
        allowDecline,
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
          }) => ({
            id,
            type,
            documentIndex,
            pageNumber,
            x,
            y,
            label,
            options,
            recipientEmail: recipientEmail?.trim().toLowerCase(),
            fontFamily: fontFamily ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureFont : owner.branding?.textFont) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? 'SCRIPT' : 'SANS'),
            fontSize: fontSize ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureSize : owner.branding?.textSize) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? 22 : 11),
            fontColor: fontColor ?? (type === 'SIGNATURE' || type === 'INITIALS' ? owner.branding?.signatureColor : owner.branding?.textColor) ?? (type === 'SIGNATURE' || type === 'INITIALS' ? '#315b45' : '#24352b'),
          }),
        ),
        owner,
        documents: documentEntities,
        recipients: recipientsInput.map((recipient, index) =>
          this.recipients.create({
            name: recipient.name.trim(),
            email: recipient.email.trim().toLowerCase(),
            role: recipient.role ?? 'SIGNER',
            signingOrder: index + 1,
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
      return this.toDto(envelope);
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await Promise.all(
        storedFiles.map((filePath) => unlink(filePath).catch(() => undefined)),
      );
      throw error;
    }
  }

  async list(ownerId: string) {
    const items = await this.envelopes.find({
      where: { owner: { id: ownerId } },
      relations: { documents: true, recipients: true },
      order: { createdAt: 'DESC' },
    });
    return items.map((item) => this.toDto(item));
  }

  async activity(ownerId: string) {
    const events = await this.events.find({
      where: { envelope: { owner: { id: ownerId } } },
      relations: { envelope: true },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      actorEmail: event.actorEmail,
      createdAt: event.createdAt,
      title: event.envelope.title,
    }));
  }

  async get(ownerId: string, id: string) {
    const envelope = await this.envelopes.findOne({
      where: { id, owner: { id: ownerId } },
      relations: { documents: true, recipients: true, events: true },
    });
    if (!envelope) throw new NotFoundException('Enveloppe introuvable.');
    if (envelope.status === 'COMPLETED' && envelope.documents.some((document) => !document.signedStorageName)) {
      try { await this.createCryptographicallySignedPdfs(envelope); }
      catch (error) { console.error('PDF cryptographic sealing failed:', error instanceof Error ? error.message : 'Unknown error'); }
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
    const recipient = await this.recipients.findOne({
      where: {
        id: recipientId,
        envelope: { id: envelopeId, owner: { id: ownerId } },
      },
      relations: { envelope: { owner: true } },
    });
    if (!recipient) throw new NotFoundException('Document introuvable.');
    const file = (recipient.collectionFiles ?? []).find(
      (item) => item.requestId === requestId,
    );
    if (!file) throw new NotFoundException('Document collecté introuvable.');
    return {
      file,
      path: join(this.uploadDirectory, file.storageName),
    };
  }

  async send(ownerId: string, id: string, webOrigin: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const envelope = await manager.getRepository(Envelope).findOne({
        where: { id, owner: { id: ownerId } },
        relations: { documents: true, recipients: true, owner: true },
      });
      if (!envelope) throw new NotFoundException('Enveloppe introuvable.');
      if (envelope.status !== 'DRAFT')
        throw new BadRequestException('Cette enveloppe a déjà été envoyée.');
      if (
        !envelope.documents.length ||
        !envelope.recipients.some((recipient) => recipient.role === 'SIGNER')
      )
        throw new BadRequestException(
          'Un document et un signataire sont nécessaires.',
        );
      envelope.status = 'SENT';
      await manager.save(envelope);
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
          name: recipient.name,
          email: recipient.email,
          role: recipient.role,
          signingUrl: `${webOrigin}/signer/${recipient.accessToken}`,
        })),
      };
    });
    return result;
  }

  async getPublicInvitation(token: string) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { documents: true, recipients: true } },
    });
    if (
      !recipient ||
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED' ||
      ['SIGNED', 'APPROVED'].includes(recipient.status)
    )
      throw new NotFoundException('Invitation introuvable ou déjà traitée.');
    if (
      recipient.envelope.expiresAt &&
      recipient.envelope.expiresAt.getTime() < Date.now()
    ) {
      recipient.envelope.status = 'EXPIRED';
      await this.envelopes.save(recipient.envelope);
      throw new BadRequestException('Cette invitation a expiré.');
    }
    return {
      recipient: {
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
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
      documents: recipient.envelope.documents.map(
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
                  .map(({ id, type, pageNumber, x, y, label, options, fontFamily, fontSize, fontColor }) => ({
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
                  }))
              : [],
        }),
      ),
    };
  }

  async uploadCollection(
    token: string,
    requestId: string,
    file?: UploadedFile,
  ) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: true },
    });
    if (
      !recipient ||
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED' ||
      ['SIGNED', 'APPROVED', 'DECLINED'].includes(recipient.status)
    ) {
      throw new NotFoundException('Cette invitation n’est plus disponible.');
    }
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
    await this.recipients.save(recipient);
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
      relations: { envelope: { documents: true } },
    });
    if (
      !recipient ||
      recipient.envelope.status === 'DRAFT' ||
      recipient.envelope.status === 'EXPIRED'
    )
      throw new NotFoundException('Invitation introuvable.');
    const document = recipient.envelope.documents.find(
      (item) => item.id === documentId,
    );
    if (!document) throw new NotFoundException('Document introuvable.');
    return { document, path: join(this.uploadDirectory, document.storageName) };
  }

  async signedDocument(ownerId: string, envelopeId: string, documentId: string) {
    const document = await this.documents.findOne({
      where: { id: documentId, envelope: { id: envelopeId, owner: { id: ownerId } } },
    });
    if (!document?.signedStorageName) throw new NotFoundException('Le PDF signé n’est pas encore disponible. Vérifiez le certificat côté serveur.');
    return { document, path: join(this.uploadDirectory, document.signedStorageName) };
  }

  async sign(
    token: string,
    signatureName: string,
    consent: boolean,
    fieldValues: Record<string, string> = {},
  ) {
    if (!signatureName?.trim() || !consent)
      throw new BadRequestException(
        'Confirmez votre nom et votre accord avant de signer.',
      );
    const result = await this.dataSource.transaction(async (manager) => {
      const recipient = await manager.getRepository(Recipient).findOne({
        where: { accessToken: token },
        relations: { envelope: { recipients: true, documents: true } },
      });
      if (
        !recipient ||
        recipient.envelope.status === 'DRAFT' ||
        recipient.envelope.status === 'EXPIRED' ||
        ['SIGNED', 'APPROVED'].includes(recipient.status)
      )
        throw new NotFoundException('Invitation introuvable ou déjà traitée.');
      if (
        recipient.envelope.expiresAt &&
        recipient.envelope.expiresAt.getTime() < Date.now()
      ) {
        recipient.envelope.status = 'EXPIRED';
        await manager.save(recipient.envelope);
        throw new BadRequestException('Cette invitation a expiré.');
      }
      const envelopeFields = (recipient.envelope.fields ?? []).filter(
        (field) =>
          !field.recipientEmail || field.recipientEmail === recipient.email,
      );
      const requiredCollections = (
        recipient.envelope.collectionRequests ?? []
      ).filter(
        (item) => item.required && item.recipientEmail === recipient.email,
      );
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
      const previousRecipient = recipient.envelope.recipients.find(
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
          completedFieldValues[field.id] = signatureName.trim();
        if (field.type === 'SIGN_DATE')
          completedFieldValues[field.id] = recipient.signedAt.toISOString();
        if (field.type === 'SIGNER_NAME')
          completedFieldValues[field.id] = recipient.name;
        if (field.type === 'SIGNER_EMAIL')
          completedFieldValues[field.id] = recipient.email;
        if (field.type === 'READ_ONLY_TEXT')
          completedFieldValues[field.id] = field.label;
      }
      await manager.save(recipient);
      const allCompleted = recipient.envelope.recipients.every((item) =>
        ['SIGNED', 'APPROVED'].includes(item.status),
      );
      recipient.envelope.status = allCompleted
        ? 'COMPLETED'
        : 'PARTIALLY_SIGNED';
      await manager.save(recipient.envelope);
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
        relations: { documents: true, recipients: true },
      });
      if (completedEnvelope) {
        try { await this.createCryptographicallySignedPdfs(completedEnvelope); }
        catch (error) { console.error('PDF cryptographic sealing failed:', error instanceof Error ? error.message : 'Unknown error'); }
      }
    }
    return result;
  }

  async decline(token: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const recipient = await manager.getRepository(Recipient).findOne({
        where: { accessToken: token },
        relations: { envelope: { recipients: true } },
      });
      if (
        !recipient ||
        recipient.envelope.status === 'DRAFT' ||
        recipient.envelope.status === 'EXPIRED' ||
        ['SIGNED', 'APPROVED', 'DECLINED'].includes(recipient.status)
      ) {
        throw new NotFoundException('Invitation introuvable ou déjà traitée.');
      }
      if (!recipient.envelope.allowDecline) {
        throw new BadRequestException(
          'Le refus de signature n’est pas autorisé pour cette invitation.',
        );
      }
      if (
        recipient.envelope.expiresAt &&
        recipient.envelope.expiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException('Cette invitation a expiré.');
      }
      recipient.status = 'DECLINED';
      recipient.envelope.status = 'VOIDED';
      await manager.save(recipient);
      await manager.save(recipient.envelope);
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

  private toDto(envelope: Envelope) {
    return {
      id: envelope.id,
      title: envelope.title,
      message: envelope.message,
      status: envelope.status,
      createdAt: envelope.createdAt,
      cryptographicPdfEnabled: Boolean(process.env.SIGNING_P12_PATH && process.env.SIGNING_P12_PASSWORD),
      documents: (envelope.documents ?? []).map((document) => ({
        id: document.id,
        name: document.originalName,
        mimeType: document.mimeType,
        size: Number(document.size),
        signedPdfAvailable: Boolean(document.signedStorageName),
      })),
      fields: envelope.fields ?? [],
      recipients: (envelope.recipients ?? []).map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
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

  private async createCryptographicallySignedPdfs(envelope: Envelope) {
    const certPath = process.env.SIGNING_P12_PATH;
    const certPassword = process.env.SIGNING_P12_PASSWORD;
    if (!certPath || !certPassword) return;
    const p12 = await readFile(resolve(certPath));
    const audit = await this.events.find({
      where: { envelope: { id: envelope.id }, action: 'DOCUMENT_SIGNED' },
      order: { createdAt: 'ASC' },
    });
    for (const [documentIndex, document] of envelope.documents.entries()) {
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
          const label = field.type === 'CHECKBOX' ? '[x] ' + field.label : value;
          const family = field.fontFamily ?? 'SANS';
          const chosenFont = family === 'SCRIPT' ? StandardFonts.TimesRomanItalic : family === 'SERIF' ? StandardFonts.TimesRoman : family === 'MONO' ? StandardFonts.Courier : StandardFonts.Helvetica;
          const fieldFont = family === 'SANS' ? font : await pdf.embedFont(chosenFont);
          const hex = field.fontColor ?? '#24352b';
          const fieldColor = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
          page.drawText(label.slice(0, 200), { x, y, size: field.fontSize ?? 11, font: fieldFont, color: fieldColor, maxWidth: page.getWidth() * 0.55 });
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
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import { Envelope, EnvelopeField } from './envelope.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { Recipient } from './recipient.entity.js';

export type IncomingRecipient = {
  name: string;
  email: string;
  role?: 'SIGNER' | 'APPROVER';
};
export type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
export type IncomingField = EnvelopeField;
const FIELD_TYPES = [
  'SIGNATURE',
  'SIGN_DATE',
  'SIGNER_NAME',
  'SIGNER_EMAIL',
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
  ) {
    if (!files?.length)
      throw new BadRequestException('Ajoutez au moins un document.');
    if (
      !recipientsInput?.length ||
      !recipientsInput.some((recipient) => recipient.role !== 'APPROVER')
    ) {
      throw new BadRequestException('Ajoutez au moins un signataire.');
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

    const owner = await this.users.findOneByOrFail({ id: ownerId });
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
        fields: fields.map(
          ({ id, type, documentIndex, pageNumber, x, y, label, options }) => ({
            id,
            type,
            documentIndex,
            pageNumber,
            x,
            y,
            label,
            options,
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

  async send(ownerId: string, id: string, webOrigin: string) {
    return this.dataSource.transaction(async (manager) => {
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
  }

  async getPublicInvitation(token: string) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { documents: true, recipients: true } },
    });
    if (
      !recipient ||
      recipient.envelope.status === 'DRAFT' ||
      ['SIGNED', 'APPROVED'].includes(recipient.status)
    )
      throw new NotFoundException('Invitation introuvable ou déjà traitée.');
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
      },
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
                    }),
                  ),
                ]
                  .filter((field) => field.documentIndex === documentIndex)
                  .map(({ id, type, pageNumber, x, y, label, options }) => ({
                    id,
                    type,
                    pageNumber,
                    x,
                    y,
                    label,
                    options,
                  }))
              : [],
        }),
      ),
    };
  }

  async publicDocument(token: string, documentId: string) {
    const recipient = await this.recipients.findOne({
      where: { accessToken: token },
      relations: { envelope: { documents: true } },
    });
    if (!recipient || recipient.envelope.status === 'DRAFT')
      throw new NotFoundException('Invitation introuvable.');
    const document = recipient.envelope.documents.find(
      (item) => item.id === documentId,
    );
    if (!document) throw new NotFoundException('Document introuvable.');
    return { document, path: join(this.uploadDirectory, document.storageName) };
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
    return this.dataSource.transaction(async (manager) => {
      const recipient = await manager.getRepository(Recipient).findOne({
        where: { accessToken: token },
        relations: { envelope: { recipients: true, documents: true } },
      });
      if (
        !recipient ||
        recipient.envelope.status === 'DRAFT' ||
        ['SIGNED', 'APPROVED'].includes(recipient.status)
      )
        throw new NotFoundException('Invitation introuvable ou déjà traitée.');
      const envelopeFields = recipient.envelope.fields ?? [];
      const missingField =
        recipient.role === 'SIGNER'
          ? envelopeFields.find((field) => {
              if (
                field.type === 'SIGN_DATE' ||
                field.type === 'SIGNER_NAME' ||
                field.type === 'SIGNER_EMAIL'
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
      };
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
      documents: (envelope.documents ?? []).map((document) => ({
        id: document.id,
        name: document.originalName,
        mimeType: document.mimeType,
        size: Number(document.size),
      })),
      fields: envelope.fields ?? [],
      recipients: (envelope.recipients ?? []).map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
        signingOrder: recipient.signingOrder,
      })),
    };
  }
}

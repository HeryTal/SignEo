import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EnvelopesService } from './envelopes.service.js';
import type {
  IncomingRecipient,
  IncomingField,
  IncomingCollectionRequest,
  UploadedFile as UploadedFileData,
} from './envelopes.service.js';

type AuthenticatedRequest = Request & { user: { sub: string; email: string } };

@Controller()
export class EnvelopesController {
  constructor(private readonly envelopes: EnvelopesService) {}

  @Get('envelopes/public/:token')
  getInvitation(@Param('token') token: string) {
    return this.envelopes.getPublicInvitation(token);
  }

  @Get('envelopes/public/:token/documents/:documentId')
  async getPublicDocument(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, path } = await this.envelopes.publicDocument(
      token,
      documentId,
    );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.originalName)}"`,
    );
    return new StreamableFile(createReadStream(path));
  }

  @Post('envelopes/public/:token/sign')
  sign(
    @Param('token') token: string,
    @Body()
    body: {
      signatureName?: string;
      consent?: boolean;
      fieldValues?: Record<string, string>;
    },
  ) {
    return this.envelopes.sign(
      token,
      body.signatureName ?? '',
      body.consent === true,
      body.fieldValues ?? {},
    );
  }

  @Get('envelopes')
  @UseGuards(JwtAuthGuard)
  list(@Req() request: AuthenticatedRequest) {
    return this.envelopes.list(request.user.sub);
  }

  @Get('envelopes/activity')
  @UseGuards(JwtAuthGuard)
  activity(@Req() request: AuthenticatedRequest) {
    return this.envelopes.activity(request.user.sub);
  }

  @Get('envelopes/:id')
  @UseGuards(JwtAuthGuard)
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.get(request.user.sub, id);
  }

  @Get('envelopes/:id/collections/:recipientId/:requestId')
  @UseGuards(JwtAuthGuard)
  async getCollectedDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
    @Param('requestId') requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { file, path } = await this.envelopes.collectedDocument(
      request.user.sub,
      id,
      recipientId,
      requestId,
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    );
    return new StreamableFile(createReadStream(path));
  }

  @Get('envelopes/:id/documents/:documentId/signed')
  @UseGuards(JwtAuthGuard)
  async getSignedDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, path } = await this.envelopes.signedDocument(request.user.sub, id, documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.originalName.replace(/\.pdf$/i, '') + '-signe.pdf')}"`);
    return new StreamableFile(createReadStream(path));
  }

  @Post('envelopes')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 50 * 1024 * 1024, files: 50 },
    }),
  )
  create(
    @Req() request: AuthenticatedRequest,
    @UploadedFiles() files: UploadedFileData[],
    @Body()
    body: {
      title?: string;
      message?: string;
      recipients?: string;
      fields?: string;
      textFields?: string;
      expiresAt?: string;
      allowDecline?: string;
      collectionRequests?: string;
      preparationSettings?: string;
    },
  ) {
    let recipients: IncomingRecipient[];
    let fields: IncomingField[];
    let collectionRequests: IncomingCollectionRequest[];
    let preparationSettings: { signingMode?: 'SIMULTANEOUS' | 'SEQUENTIAL' | 'CUSTOM'; documentVisibility?: string[][] };
    try {
      preparationSettings = JSON.parse(body.preparationSettings ?? '{}');
    } catch {
      throw new BadRequestException('Les paramètres de préparation sont invalides.');
    }
    try {
      recipients = JSON.parse(body.recipients ?? '[]') as IncomingRecipient[];
    } catch {
      throw new BadRequestException('La liste des destinataires est invalide.');
    }
    try {
      fields = JSON.parse(
        body.fields ?? body.textFields ?? '[]',
      ) as IncomingField[];
    } catch {
      throw new BadRequestException('La liste des champs texte est invalide.');
    }
    try {
      collectionRequests = JSON.parse(
        body.collectionRequests ?? '[]',
      ) as IncomingCollectionRequest[];
    } catch {
      throw new BadRequestException(
        'La liste des documents à collecter est invalide.',
      );
    }
    return this.envelopes.create(
      request.user.sub,
      body.title ?? '',
      body.message ?? '',
      recipients,
      files ?? [],
      fields,
      body.expiresAt,
      body.allowDecline === 'true',
      collectionRequests,
      preparationSettings,
    );
  }

  @Post('envelopes/:id/send')
  @UseGuards(JwtAuthGuard)
  send(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return this.envelopes.send(request.user.sub, id, webOrigin);
  }

  @Post('envelopes/public/:token/decline')
  decline(@Param('token') token: string, @Body() body: { reason?: string }) {
    return this.envelopes.decline(token, body.reason ?? '');
  }

  @Post('envelopes/public/:token/collections/:requestId')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  uploadCollection(
    @Param('token') token: string,
    @Param('requestId') requestId: string,
    @UploadedFile() file: UploadedFileData,
  ) {
    return this.envelopes.uploadCollection(token, requestId, file);
  }
}

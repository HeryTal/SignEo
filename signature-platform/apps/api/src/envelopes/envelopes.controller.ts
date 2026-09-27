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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  EnvelopesService,
  IncomingRecipient,
  IncomingField,
  UploadedFile,
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

  @Post('envelopes')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 50 * 1024 * 1024, files: 10 },
    }),
  )
  create(
    @Req() request: AuthenticatedRequest,
    @UploadedFiles() files: UploadedFile[],
    @Body()
    body: {
      title?: string;
      message?: string;
      recipients?: string;
      fields?: string;
      textFields?: string;
    },
  ) {
    let recipients: IncomingRecipient[];
    let fields: IncomingField[];
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
    return this.envelopes.create(
      request.user.sub,
      body.title ?? '',
      body.message ?? '',
      recipients,
      files ?? [],
      fields,
    );
  }

  @Post('envelopes/:id/send')
  @UseGuards(JwtAuthGuard)
  send(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return this.envelopes.send(request.user.sub, id, webOrigin);
  }
}

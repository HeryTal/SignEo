import { Controller, Get } from '@nestjs/common';

@Controller('v1')
export class OpenApiController {
  @Get('openapi.json')
  spec() {
    return {
      openapi: '3.0.3',
      info: { title: 'Signeo API', version: '1.1.0', description: 'API REST pour vos enveloppes de signature.' },
      servers: [{ url: process.env.API_PUBLIC_URL ?? 'http://localhost:3001' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        schemas: { Recipient: { type: 'object', required: ['name', 'email'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['SIGNER', 'APPROVER'] } } } },
      },
      paths: {
        '/v1/envelopes': {
          get: { summary: 'Liste les enveloppes de l’environnement de la clé', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Liste des enveloppes' }, '401': { description: 'Clé absente ou invalide' }, '403': { description: 'Permission insuffisante' }, '429': { description: 'Limite de débit atteinte' } } },
          post: { summary: 'Crée une enveloppe brouillon', description: 'Requête multipart : files[] (PDF ou DOCX), title, message, recipients (JSON), fields (JSON), expiresAt.', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Enveloppe créée' }, '403': { description: 'Scope envelopes:write requis' } } },
        },
        '/v1/envelopes/{id}/send': { post: { summary: 'Envoie une enveloppe brouillon', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '201': { description: 'Enveloppe envoyée' }, '404': { description: 'Enveloppe absente de cet environnement' } } } },
      },
    };
  }
}

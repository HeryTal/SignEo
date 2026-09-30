import { Controller, Get } from '@nestjs/common';

@Controller('v1')
export class OpenApiController {
  @Get('openapi.json')
  spec() {
    return { openapi: '3.0.3', info: { title: 'Signeo API', version: '1.0.0', description: 'API REST pour vos enveloppes de signature.' }, servers: [{ url: process.env.API_PUBLIC_URL ?? 'http://localhost:3001' }], components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }, paths: { '/v1/envelopes': { get: { summary: 'Liste les enveloppes de l’espace de travail', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Liste des enveloppes' }, '401': { description: 'Clé absente ou invalide' }, '403': { description: 'Permission insuffisante' }, '429': { description: 'Limite de débit atteinte' } } } } } };
  }
}

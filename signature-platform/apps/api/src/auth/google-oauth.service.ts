import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';

type GoogleClaims = { iss?: string; aud?: string | string[]; exp?: number; email?: string; email_verified?: boolean; name?: string };
type GoogleJwk = JsonWebKey & { kid?: string; use?: string };

@Injectable()
export class GoogleOAuthService {
  get configured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  begin() {
    if (!this.configured) throw new BadRequestException('La connexion Google n’est pas encore configurée.');
    const state = randomBytes(32).toString('base64url');
    const signedState = `${state}.${this.sign(state)}`;
    const parameters = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: signedState,
      prompt: 'select_account',
    });
    return { state: signedState, url: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}` };
  }

  verifyState(state: string, cookieState: string | undefined) {
    if (!cookieState || !state || !this.safeEqual(state, cookieState)) {
      throw new UnauthorizedException('La vérification de sécurité Google a expiré. Réessayez.');
    }
    const [value, signature] = state.split('.');
    if (!value || !signature || !this.safeEqual(signature, this.sign(value))) {
      throw new UnauthorizedException('La vérification de sécurité Google est invalide.');
    }
  }

  async getIdentity(code: string) {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResponse.json() as { id_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokens.id_token) {
      throw new UnauthorizedException(tokens.error_description || 'Google n’a pas validé cette connexion.');
    }

    const claims = await this.verifyIdToken(tokens.id_token);
    if (!claims.email || claims.email_verified !== true) {
      throw new UnauthorizedException('Google doit confirmer une adresse e-mail vérifiée.');
    }
    return { email: claims.email, name: claims.name ?? '' };
  }

  private get redirectUri() {
    return process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/auth/google/callback';
  }

  private sign(value: string) {
    return createHmac('sha256', process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.JWT_SECRET ?? 'local-development-secret-change-me')
      .update(value)
      .digest('base64url');
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async verifyIdToken(idToken: string): Promise<GoogleClaims> {
    const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) throw new UnauthorizedException('Jeton Google invalide.');
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('Signature Google non prise en charge.');

    const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cache: 'no-store' });
    const jwks = await jwksResponse.json() as { keys?: GoogleJwk[] };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.use === 'sig');
    if (!jwk) throw new UnauthorizedException('Clé de signature Google introuvable.');

    const publicKey = createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: 'jwk' });
    const valid = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'));
    if (!valid) throw new UnauthorizedException('Signature Google invalide.');

    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as GoogleClaims;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss ?? '') || !audience.includes(process.env.GOOGLE_CLIENT_ID) || !claims.exp || claims.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Jeton Google expiré ou destiné à une autre application.');
    }
    return claims;
  }
}

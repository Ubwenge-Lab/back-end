import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';

type WebhookRequest = Request & { rawBody?: Buffer };

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<WebhookRequest>();
    const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new UnauthorizedException(
        'Webhook verification secret is not configured',
      );
    }

    // 1. Direct Secret Verification (Header: X-Webhook-Secret)
    const clientSecret = this.getSingleHeader(
      request.headers['x-webhook-secret'],
    );
    if (clientSecret && this.securelyMatches(clientSecret, webhookSecret)) {
      return true;
    }

    // 2. HMAC Signature Verification (Header: X-Signature)
    const signature = this.getSingleHeader(request.headers['x-signature']);
    if (signature && request.rawBody && /^[a-f\d]{64}$/i.test(signature)) {
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(request.rawBody)
        .digest();
      const providedSignature = Buffer.from(signature, 'hex');

      if (
        providedSignature.length === computedSignature.length &&
        crypto.timingSafeEqual(providedSignature, computedSignature)
      ) {
        return true;
      }
    }

    throw new UnauthorizedException(
      'Invalid or missing webhook authorization credentials',
    );
  }

  private getSingleHeader(
    header: string | string[] | undefined,
  ): string | undefined {
    return typeof header === 'string' ? header : undefined;
  }

  private securelyMatches(value: string, expected: string): boolean {
    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);

    return (
      valueBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(valueBuffer, expectedBuffer)
    );
  }
}

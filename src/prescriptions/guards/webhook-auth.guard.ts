import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new UnauthorizedException('Webhook verification secret is not configured');
    }

    // 1. Direct Secret Verification (Header: X-Webhook-Secret)
    const clientSecret = request.headers['x-webhook-secret'];
    if (clientSecret && clientSecret === webhookSecret) {
      return true;
    }

    // 2. HMAC Signature Verification (Header: X-Signature)
    const signature = request.headers['x-signature'];
    if (signature && request.body) {
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(request.body))
        .digest('hex');

      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
        return true;
      }
    }

    throw new UnauthorizedException('Invalid or missing webhook authorization credentials');
  }
}
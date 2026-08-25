import { Test, TestingModule } from '@nestjs/testing';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';

describe('WebhookAuthGuard', () => {
  let guard: WebhookAuthGuard;
  let configServiceMock: jest.Mocked<ConfigService>;

  const SECRET = 'test-webhook-secret-key';

  const mockExecutionContext = (
    headers: Record<string, string>,
    body: Record<string, string> = {},
    rawBody = Buffer.from(JSON.stringify(body)),
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          rawBody,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn().mockReturnValue(SECRET),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookAuthGuard,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    guard = module.get<WebhookAuthGuard>(WebhookAuthGuard);
  });

  it('should grant access when valid x-webhook-secret header is provided', () => {
    const context = mockExecutionContext({ 'x-webhook-secret': SECRET });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should grant access when valid HMAC x-signature header is provided', () => {
    const body = { prescriptionId: 'p-1', status: 'FULFILLED' };
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(JSON.stringify(body))
      .digest('hex');

    const context = mockExecutionContext({ 'x-signature': signature }, body);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when secret is missing or incorrect', () => {
    const context = mockExecutionContext({
      'x-webhook-secret': 'invalid-secret',
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should reject malformed HMAC signatures instead of throwing RangeError', () => {
    const context = mockExecutionContext({ 'x-signature': 'bad' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should verify the exact raw request body', () => {
    const body = { prescriptionId: 'p-1', status: 'FULFILLED' };
    const differentlyFormattedBody = Buffer.from(
      '{\n  "prescriptionId": "p-1",\n  "status": "FULFILLED"\n}',
    );
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(differentlyFormattedBody)
      .digest('hex');
    const context = mockExecutionContext(
      { 'x-signature': signature },
      body,
      differentlyFormattedBody,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when WEBHOOK_SECRET config is not set', () => {
    configServiceMock.get.mockReturnValue(undefined);
    const context = mockExecutionContext({ 'x-webhook-secret': SECRET });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});

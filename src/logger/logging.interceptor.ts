// src/logger/logging.interceptor.ts
// Global interceptor — logs every HTTP request/response with timing and correlation

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

// Fields to strip from logged request bodies
const SENSITIVE_FIELDS = new Set([
  'password',
  'confirmPassword',
  'newPassword',
  'currentPassword',
  'tempPassword',
  'refreshToken',
]);

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl } = req;
    const correlationId = req.correlationId || 'N/A';
    const userId = (req as any).user?.sub || 'anonymous';
    const startTime = Date.now();

    // Log the incoming request
    const sanitizedBody =
      req.body && Object.keys(req.body).length > 0
        ? sanitizeBody(req.body)
        : undefined;

    this.logger.log(
      `[REQ ${correlationId}] ${method} ${originalUrl}` +
        ` | user=${userId}` +
        (sanitizedBody ? ` | body=${JSON.stringify(sanitizedBody)}` : ''),
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `[RES ${correlationId}] ${method} ${originalUrl}` +
              ` → ${res.statusCode} (${duration}ms)`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const status = error?.status || error?.statusCode || 500;
          this.logger.error(
            `[RES ${correlationId}] ${method} ${originalUrl}` +
              ` → ${status} (${duration}ms)` +
              ` | ${error.message || error}`,
            error.stack,
          );
        },
      }),
    );
  }
}

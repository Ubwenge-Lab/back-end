import {
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../notifications/email.service';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Fall back to default BaseExceptionFilter if this is not an HTTP request context (e.g. WebSockets)
    if (!response || !request || typeof response.status !== 'function') {
      return super.catch(exception, host);
    }

    // Generate a unique Correlation ID for secure tracking
    const correlationId = uuidv4();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let clientMessage: any =
      'An unexpected error occurred. Please contact support.';
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        // If it's a validation error array, join it nicely, else extract the message
        const msg = (exceptionResponse as any).message;
        clientMessage = Array.isArray(msg)
          ? msg.join(', ')
          : msg || exceptionResponse;
      } else {
        clientMessage = exceptionResponse;
      }
    }

    const errorStack =
      exception instanceof Error ? exception.stack : String(exception);
    const errorMessage =
      exception instanceof Error ? exception.message : String(exception);

    this.logger.error(
      `[Error-Trace] Correlation ID: ${correlationId} | Path: ${request.method} ${request.url}\n` +
      `Message: ${errorMessage}\n` +
      `Stack: ${errorStack}`,
    );

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      // Sending to Sentry
      Sentry.withScope((scope) => {
        scope.setTag('correlationId', correlationId)
        scope.setExtra('path', `${request.method} ${request.url}`);
        Sentry.captureException(exception)
      })


      this.sendEmailAlert({
        correlationId,
        path: `${request.method} ${request.url}`,
        message: errorMessage,
        stack: errorStack || 'No stack trace available.',
      }).catch((err) => {
        this.logger.warn(`Failed to send email alert: ${err.message}`);
      });
    }

    response.status(status).json({
      statusCode: status,
      message:
        typeof clientMessage === 'string'
          ? clientMessage
          : JSON.stringify(clientMessage),
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
    });
  }

  /**
   * Reuses the system's existing EmailService to notify the admin about the 500 error
   */
  private async sendEmailAlert(details: {
    correlationId: string;
    path: string;
    message: string;
    stack: string;
  }) {
    const appName =
      this.configService.get<string>('RESEND_FROM_NAME') || 'E-Vuze Healthcare';
    const actionUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const title = ` [${appName}] Critical System Error [500]`;
    const htmlMessage = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;color:#334155;line-height:1.6;">
        <h2 style="color:#e11d48;margin:0 0 16px;font-size:20px;border-bottom:2px solid #fee2e2;padding-bottom:8px;">
          Critical Internal Server Error Caught
        </h2>
        <p style="margin:0 0 16px;font-size:14px;">
          An unexpected crash occurred on the <strong>${appName}</strong> backend. Use the diagnostics below to troubleshoot.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0;font-weight:bold;color:#475569;width:150px;">Endpoint Path:</td>
            <td style="padding:8px 0;font-family:monospace;color:#0f172a;">${details.path}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:bold;color:#475569;">Correlation ID:</td>
            <td style="padding:8px 0;font-family:monospace;color:#0f172a;background:#f8fafc;padding-left:6px;border-radius:4px;">
              ${details.correlationId}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:bold;color:#475569;">Error Message:</td>
            <td style="padding:8px 0;color:#e11d48;font-weight:500;">${details.message}</td>
          </tr>
        </table>
        
        <h3 style="color:#475569;font-size:15px;margin:24px 0 8px;">Stack Trace (Developers Only)</h3>
        <pre style="background:#0f172a;color:#cbd5e1;padding:16px;border-radius:8px;font-family:Consolas,monospace;font-size:12px;max-height:350px;overflow:auto;line-height:1.4;">
${details.stack}
        </pre>
      </div>
    `;

    // Send the alert using the pre-existing EmailService.
    // Under the hood, this automatically emails whoever is listed as SUPER_ADMIN_EMAIL in the env!
    await this.emailService.sendSuperAdminAlert(
      title,
      htmlMessage,
      'Go to Dashboard',
      actionUrl,
    );
  }
}

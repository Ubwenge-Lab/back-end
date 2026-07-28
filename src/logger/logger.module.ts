// src/logger/logger.module.ts
// Global logger module — configures Winston for the entire application

import { Global, Module } from '@nestjs/common';
import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as winston from 'winston';
import { getCorrelationId } from './correlation.storage';

// Keys that should never appear in plain text in any log line
// This means request bodies, response objects, error metadata, etc
const SENSITIVE_KEYS = new Set([
  'password',
  'confirmPassword',
  'newPassword', 'currentPassword', 'tempPassword', 'refreshToken', 'accessToken', 'token', 'authorization', 'secret', 'cookie', 'jwt', 'rdbCertificate', 'pharmacyLicense', 'businessRegistration', 'hospitalLicense',
])

// catching every object and replacing the sensitive field with [REDACTED]
// A `depth` guard which prevents infinite loops on circular references
function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined)
    return obj;
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? '[REDACTED]'
      : redactObject(value, depth + 1)
  }
  return result
}

// Custom format that injects correlationId into every log line
const correlationFormat = winston.format((info) => {
  info.correlationId = getCorrelationId() || 'SYSTEM';
  return info;
});

// Logic handling two cases: logger.log({password: '...'}) -> Object passed as message; Extra metadata fields on the log record

const redactFormat = winston.format((info) => {
  if (typeof info.message === 'object' && info.message !== null) {
    info.message = redactObject(info.message) as string;
  }

  // Metadata redaction for keys present at the same level as message
  const systemKeys = new Set(['level', 'message', 'timestamp', 'correlationId', 'ms', 'context', 'stack', 'splat',])

  for (const key of Object.keys(info)) {
    if (systemKeys.has(key)) continue;
    if (SENSITIVE_KEYS.has(key)) {
      (info as Record<string, unknown>)[key] = '[REDACTED]';
    } else {
      (info as Record<string, unknown>)[key] = redactObject(
        (info as Record<string, unknown>)[key],
      )
    }
  }

  return info;
})


const isProduction = process.env.NODE_ENV === 'production';

@Global()
@Module({
  imports: [
    WinstonModule.forRoot({
      level: isProduction ? 'info' : 'debug',
      transports: [
        new winston.transports.Console({
          format: isProduction
            ? // Production: structured JSON for log aggregators (Datadog, ELK, etc.)
            winston.format.combine(
              correlationFormat(),
              redactFormat(),
              winston.format.timestamp(),
              winston.format.json(),
            )
            : // Development: colorized, human-readable output
            winston.format.combine(
              correlationFormat(),
              redactFormat(),
              winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
              winston.format.ms(),
              nestWinstonModuleUtilities.format.nestLike('E-Vuze', {
                colors: true,
                prettyPrint: true,
              }),
            ),
        }),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule { }

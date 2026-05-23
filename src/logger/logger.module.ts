// src/logger/logger.module.ts
// Global logger module — configures Winston for the entire application

import { Global, Module } from '@nestjs/common';
import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as winston from 'winston';
import { getCorrelationId } from './correlation.storage';

// Custom format that injects correlationId into every log line
const correlationFormat = winston.format((info) => {
  info.correlationId = getCorrelationId() || 'SYSTEM';
  return info;
});

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
                winston.format.timestamp(),
                winston.format.json(),
              )
            : // Development: colorized, human-readable output
              winston.format.combine(
                correlationFormat(),
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
export class LoggerModule {}

// backend/src/main.ts

// IMPORTANT: dotenv MUST be loaded before ANYTHING else so that
// process.env is fully populated when Sentry.init() reads SENTRY_DSN.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, LoggerService } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded, type Request } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './notifications/email.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AuditService } from './audit/audit.service';
import { QueryLoggerInterceptor } from './common/interceptors/query-logger.interceptor';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  // dsn is read automatically from process.env.SENTRY_DSN by the SDK
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  integrations: [
    nodeProfilingIntegration(),
    // Capture all console logs, warnings, and errors automatically
    Sentry.captureConsoleIntegration({ levels: ['log', 'warn', 'error'] }),
  ],
  environment: process.env.NODE_ENV || 'development',
});
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Tell Express to trust the proxy (important for secure cookies when behind a proxy like Render)
  app.set('trust proxy', 1);

  // Increase payload size limit to 50MB for file uploads (RDB certificates, licenses)
  app.use(
    json({
      limit: '50mb',
      verify: (request: Request & { rawBody?: Buffer }, _response, buffer) => {
        if (
          request.originalUrl?.includes(
            '/prescriptions/webhook/external-fulfillment',
          )
        ) {
          request.rawBody = Buffer.from(buffer);
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Security (Upgrade HTTP header Hardening)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          // 'unsafe-inline' is required for Swagger UI styles to render properly
          styleSrc: [`'self'`, `'unsafe-inline'`],
          // Allows Swagger assets and cross-origin images (like prescription uploads or pharmacy logos)
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io', 'https:'],
          // 'unsafe-inline' allows Swagger interactive execution scripts to run
          scriptSrc: [`'self'`, `'unsafe-inline'`, 'https://cdn.jsdelivr.net'],
        },
      },
      // Allows frontend applications on other origins to safely request backend assets
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Compress all responses — significantly reduces bandwidth under concurrent load
  // (JSON payloads like medication lists and order histories can be 60-80% smaller)
  app.use(compression());

  // CORS - Allow frontend on port 3000
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')
    : [];

  app.enableCors({
    origin: [
      ...allowedOrigins, // pulls from Render env variable
      'http://localhost:3000',
      /^https:\/\/.*\.vercel\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'ngrok-skip-browser-warning',
    ],
    exposedHeaders: ['x-request-id'],
  });

  // Global prefix
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Handling
  const configService = app.get(ConfigService);
  const emailService = app.get(EmailService);
  const auditService = app.get(AuditService);
  app.useGlobalFilters(new GlobalExceptionFilter(configService, emailService, auditService));

  // Request timing & slow-query monitoring (DB Optimization — Sprint 2 Task 3)
  app.useGlobalInterceptors(new QueryLoggerInterceptor());

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('E-Vuze Pharmacy API')
    .setDescription('E-Vuze Pharmacy Triangulation MVP API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(
    `🏥 E-Vuze Pharmacy API is running on http://localhost:${port}`,
    'Bootstrap',
  );
  logger.log(
    `📚 API Docs available at http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // Winston not available if bootstrap failed — fall back to stderr

  console.error('❌ Failed to start application:', err);
  process.exit(1);
});

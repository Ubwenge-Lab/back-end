// backend/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, LoggerService } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Increase payload size limit to 50MB for file uploads (RDB certificates, licenses)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Security
  app.use(helmet());

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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
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
  // eslint-disable-next-line no-console
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});

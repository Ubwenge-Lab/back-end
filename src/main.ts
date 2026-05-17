// backend/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Tell Express to trust the proxy (important for secure cookies when behind a proxy like Render)
  app.set('trust proxy', 1);

  // Increase payload size limit to 50MB for file uploads (RDB certificates, licenses)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Security( Upgrade HTTP header Hardening)
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
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🏥 E-Vuze Pharmacy API is running!                     ║
    ║                                                           ║
    ║   🌐 Local:            http://localhost:${port}            ║
    ║   📚 API Docs:         http://localhost:${port}/api/docs  ║
    ║   🗄️  Database:         Connected                         ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

// backend/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Increase payload size limit to 50MB for file uploads (RDB certificates, licenses)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Security
  app.use(helmet());

  // CORS - Allow frontend on port 3000
  app.enableCors({
    origin: [
      'https://evuze-testing.vercel.app',
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

bootstrap();
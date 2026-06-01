import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { InvoicePaidListener } from './invoice-paid.listener';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [PdfService, InvoicePaidListener],
  exports: [PdfService],
})
export class DocumentsModule {}

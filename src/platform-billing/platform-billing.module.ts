import { Module } from '@nestjs/common';
import { PlatformBillingService } from './platform-billing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlatformBillingService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}

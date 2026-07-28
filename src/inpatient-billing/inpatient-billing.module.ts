import { Module } from '@nestjs/common';
import { InpatientBillingService } from './inpatient-billing.service';
import { InpatientBillingController } from './inpatient-billing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InpatientBillingController],
  providers: [InpatientBillingService],
})
export class InpatientBillingModule {}

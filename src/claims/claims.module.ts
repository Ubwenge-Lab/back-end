import { Module } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InsuranceDispatchService } from './insurance-dispatch.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClaimsController],
  providers: [ClaimsService, InsuranceDispatchService],
  exports: [ClaimsService],
})
export class ClaimsModule {}

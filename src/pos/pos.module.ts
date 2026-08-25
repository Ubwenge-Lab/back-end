// backend/src/pos/pos.module.ts

import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffModule } from '../staff/staff.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, StaffModule, AuditModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}

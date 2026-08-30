import { Module } from '@nestjs/common';
import { StaffLeaveController } from './staff-leave.controller';
import { StaffLeaveService } from './staff-leave.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffModule } from '../staff/staff.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, StaffModule, AuditModule],
  controllers: [StaffLeaveController],
  providers: [StaffLeaveService],
  exports: [StaffLeaveService],
})
export class StaffLeaveModule {}

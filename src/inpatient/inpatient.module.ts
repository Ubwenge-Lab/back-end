import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InpatientController } from './inpatient.controller';
import { InpatientService } from './inpatient.service';

@Module({
  imports: [PrismaModule],
  controllers: [InpatientController],
  providers: [InpatientService],
  exports: [InpatientService],
})
export class InpatientModule {}

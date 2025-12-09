// backend/src/medications/medications.module.ts

import { Module } from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { MedicationsController } from './medications.controller';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';

@Module({
  imports: [PharmaciesModule],
  controllers: [MedicationsController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}
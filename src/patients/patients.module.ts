// backend/src/patients/patients.module.ts

import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PatientPortalController } from './patient-portal.controller';

@Module({
  controllers: [PatientsController, PatientPortalController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}

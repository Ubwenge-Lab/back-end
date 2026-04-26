// backend/src/medications/dto/update-medication.dto.ts

import { PartialType } from '@nestjs/swagger';
import { CreateMedicationDto } from './create-medication.dto';

export class UpdateMedicationDto extends PartialType(CreateMedicationDto) {}

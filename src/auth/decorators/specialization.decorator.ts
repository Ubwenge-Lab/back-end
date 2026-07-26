// backend/src/auth/decorators/specialization.decorator.ts

import { SetMetadata } from '@nestjs/common';
import { TechnicianSpecialization } from '../../common/constants/technician-specialization.enum';

export const SPECIALIZATION_KEY = 'specialization';
export const RequireSpecialization = (...specializations: TechnicianSpecialization[]) =>
  SetMetadata(SPECIALIZATION_KEY, specializations);

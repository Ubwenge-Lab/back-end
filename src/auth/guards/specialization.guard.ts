// backend/src/auth/guards/specialization.guard.ts

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TechnicianSpecialization } from '../../common/constants/technician-specialization.enum';
import { SPECIALIZATION_KEY } from '../decorators/specialization.decorator';

@Injectable()
export class SpecializationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredSpecializations = this.reflector.getAllAndOverride<TechnicianSpecialization[]>(
      SPECIALIZATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredSpecializations || requiredSpecializations.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    return requiredSpecializations.some((s) => user.specialization === s);
  }
}

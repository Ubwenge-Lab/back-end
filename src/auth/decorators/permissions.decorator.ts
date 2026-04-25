// backend/src/auth/decorators/permissions.decorator.ts

import { SetMetadata } from '@nestjs/common';
import { StaffPermission } from '../../common/constants/staff-permission.enum';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: StaffPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

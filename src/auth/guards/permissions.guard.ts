// backend/src/auth/guards/permissions.guard.ts

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { StaffPermission } from '../../common/constants/staff-permission.enum';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<StaffPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Branch managers have all permissions
    if (user.role === 'BRANCH_MANAGER') {
      return true;
    }

    // Check if user is staff
    const staffRoles = ['PHARMACIST', 'CASHIER', 'NURSE'];
    if (!staffRoles.includes(user.role)) {
      throw new ForbiddenException('Only staff members can access this resource');
    }

    // Get staff permissions
    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.sub },
      include: { permissions: true },
    });

    if (!staff || !staff.permissions) {
      throw new ForbiddenException('Staff permissions not found');
    }

    // Check if staff has all required permissions
    const hasPermissions = requiredPermissions.every(permission =>
      staff.permissions.permissions.includes(permission),
    );

    if (!hasPermissions) {
      throw new ForbiddenException(
        `You don't have the required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
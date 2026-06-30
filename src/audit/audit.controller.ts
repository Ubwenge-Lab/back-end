import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @Roles(Role.SUPER_ADMIN, Role.HOSPITAL_ADMIN)
  async getAuditLogs(
    @CurrentUser() user: any,
    @Query('tableName') tableName?: string,
    @Query('userId') userId?: string,
  ) {
    return this.auditService.getLogs(user.sub || user.id, user.role, { tableName, userId });
  }
}

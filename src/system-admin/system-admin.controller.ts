import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { SystemAdminService } from './system-admin.service';

@ApiTags('System Admin')
@Controller('system-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SYSTEM_ADMIN)
@ApiBearerAuth()
export class SystemAdminController {
  constructor(private readonly systemAdminService: SystemAdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get System Admin dashboard stats' })
  getDashboardStats() {
    return this.systemAdminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all platform users' })
  getAllUsers() {
    return this.systemAdminService.getAllUsers();
  }
}

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NursesService } from './nurses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Nurses')
@Controller('nurses')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NursesController {
  constructor(private readonly nursesService: NursesService) {}

  @Get('dashboard')
  @Roles(Role.NURSE)
  @ApiOperation({ summary: 'Get daily dashboard statistics for the logged-in nurse' })
  getDashboardStats(@Req() req: any) {
    return this.nursesService.getDashboardStats(req.user.sub);
  }
}
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TriangulationService } from './triangulation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Triangulation')
@Controller('triangulation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@ApiBearerAuth()
export class TriangulationController {
    constructor(private readonly triangulationService: TriangulationService) { }

    @Get('global')
    @ApiOperation({ summary: 'Get all pharmacy and branch coordinates globally' })
    getGlobalCoordinates() {
        return this.triangulationService.getGlobalCoordinates();
    }
}

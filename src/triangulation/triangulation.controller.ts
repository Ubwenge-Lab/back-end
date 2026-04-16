import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TriangulationService } from './triangulation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { Controller, Get, Query, ParseFloatPipe, BadRequestException } from '@nestjs/common';
import { TriangulationService } from '.triangulation.service';


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

// GET method for patient-view triangulation

@Controller('triangulation')
export class TriangulationController {
  constructor(private readonly triangulationService: TriangulationService) {}

  @Get('nearby')
  async findNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
  ) {
       return this.triangulationService.getNearbyBranches(lat, lng);
  }
}

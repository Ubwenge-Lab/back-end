import {
  Controller,
  Get,
  Query,
  ParseFloatPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TriangulationService } from './triangulation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { MapDataQueryDto } from './dto/map-data-query.dto';

@ApiTags('Triangulation')
@Controller('triangulation')
@UseGuards(JwtAuthGuard, RolesGuard) // General security for all routes
@ApiBearerAuth()
export class TriangulationController {
  constructor(private readonly triangulationService: TriangulationService) {}

  /**
   * Access: PATIENTS and ADMINS
   */
  @Get('nearby')
  @ApiOperation({
    summary: 'Find nearest branches based on patient coordinates',
  })
  async findNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
  ) {
    return this.triangulationService.getNearbyBranches(lat, lng);
  }

  /**
   * ADMIN ONLY: Global overview
   * Access: SUPER_ADMIN
   */
  @Get('global')
  @Roles(Role.SUPER_ADMIN) // Specific restriction for this endpoint only
  @ApiOperation({ summary: 'Get all pharmacy and branch coordinates globally' })
  getGlobalCoordinates() {
    return this.triangulationService.getGlobalCoordinates();
  }

  @Get('map-data')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get grouped pharmacies, branches and nearby patients by district',
  })
  getMapData(@Query() query: MapDataQueryDto) {
    return this.triangulationService.getMapData(query);
  }
}

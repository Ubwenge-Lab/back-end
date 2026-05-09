import {
  Controller,
  Get,
  Query,
  ParseFloatPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TriangulationService } from './triangulation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { MapDataQueryDto } from './dto/map-data-query.dto';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PharmacyLocationDto } from '../pharmacies/dto/pharmacy_location.dto';


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

  @Get('owner')
  @Roles(Role.PHARMACY)
  @ApiOperation({
    summary: "Get triangulation data for pharmacy owner's branches",
  })
  async getOwnerBranches(@Req() req: Request) {
    const user = req.user as any;
    const pharmacy = await this.triangulationService[
      'prisma'
    ].pharmacy.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!pharmacy) {
      throw new Error('Pharmacy not found');
    }
    return this.triangulationService.getOwnerBranches(pharmacy.id);
  }

  @Get('manager')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: "Get triangulation data for branch manager's branch against sister branches",
  })
  async getManagerTriangulation(@Req() req: Request) {
    const user = req.user as any;
    return this.triangulationService.getManagerTriangulation(user.sub);
  }

  /**
   * BRANCH_MANAGER ONLY: Get nearby competitor pharmacies
   */
  @Get('competitors')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Get nearby competitor pharmacies for branch manager',
    description: 'Returns competitor pharmacies within proximity radius, excluding manager\'s own network'
  })
  @ApiResponse({
    status: 200,
    description: 'List of competitor pharmacies with distances',
    type: [PharmacyLocationDto]
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required'
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Branch Manager role required'
  })
  async getCompetitors(@CurrentUser() user: any): Promise<PharmacyLocationDto[]> {
    if (!user || !user.sub) {
      throw new Error('User not found in token');
    }
    
    return this.triangulationService.getCompetitors(user.sub);
  }
}

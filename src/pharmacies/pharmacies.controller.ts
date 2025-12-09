// backend/src/pharmacies/pharmacies.controller.ts

import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PharmaciesService } from './pharmacies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';

@ApiTags('Pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private pharmaciesService: PharmaciesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all approved pharmacies (Public)' })
  getApprovedPharmacies() {
    return this.pharmaciesService.getApprovedPharmacies();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pharmacy by ID' })
  getPharmacyById(@Param('id') id: string) {
    return this.pharmaciesService.findById(id);
  }

  @Get('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy profile' })
  getProfile(@Req() req: any) {
    return this.pharmaciesService.getProfile(req.user.sub);
  }

  @Put('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pharmacy profile' })
  async updateProfile(@Req() req: any, @Body() dto: UpdatePharmacyDto) {
    const pharmacy = await this.pharmaciesService.getProfile(req.user.sub);
    return this.pharmaciesService.update(pharmacy.id, dto);
  }
}
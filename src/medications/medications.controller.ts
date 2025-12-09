// backend/src/medications/medications.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MedicationsService } from './medications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CreateMedicationDto, UpdateMedicationDto, SearchMedicationsDto } from './dto';

@ApiTags('Medications')
@Controller('medications')
export class MedicationsController {
  constructor(private medicationsService: MedicationsService) {}

  // Public - Search medications
  @Get('search')
  @ApiOperation({ summary: 'Search medications across all pharmacies' })
  search(@Query() dto: SearchMedicationsDto) {
    return this.medicationsService.search(dto);
  }

  // Get medication by ID
  @Get(':id')
  @ApiOperation({ summary: 'Get medication by ID' })
  getMedicationById(@Param('id') id: string) {
    return this.medicationsService.findById(id);
  }

  // Pharmacy - Get their medications
  @Get('pharmacy/my-medications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy medications' })
  async getMyMedications(@Req() req: any) {
    const pharmacy = await req.user.sub;
    // This will be handled in the service
    return this.medicationsService.findByPharmacy(pharmacy);
  }

  // Pharmacy - Create medication
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create medication' })
  create(@Req() req: any, @Body() dto: CreateMedicationDto) {
    return this.medicationsService.create(req.user.sub, dto);
  }

  // Pharmacy - Update medication
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update medication' })
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateMedicationDto) {
    return this.medicationsService.update(id, req.user.sub, dto);
  }

  // Pharmacy - Delete medication
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete medication' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.medicationsService.delete(id, req.user.sub);
  }

  // Pharmacy - Get low stock
  @Get('pharmacy/low-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get low stock medications' })
  getLowStock(@Req() req: any) {
    return this.medicationsService.getLowStock(req.user.sub);
  }

  // Pharmacy - Get out of stock
  @Get('pharmacy/out-of-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get out of stock medications' })
  getOutOfStock(@Req() req: any) {
    return this.medicationsService.getOutOfStock(req.user.sub);
  }
}
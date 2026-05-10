import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';
import { HospitalsService } from './hospitals.service';
import { HospitalDto } from './dto/hospital.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Hospitals')
@Controller('hospitals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get all hospitals' })
  @ApiOkResponse({ type: [HospitalDto], description: 'List of all hospitals' })
  findAll() {
    return this.hospitalsService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get a hospital by ID' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiOkResponse({ type: HospitalDto, description: 'Hospital details' })
  @ApiNotFoundResponse({ description: 'Hospital not found' })
  findOne(@Param('id') id: string) {
    return this.hospitalsService.findOne(id);
  }
}

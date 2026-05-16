import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiQuery,
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

  // 1. Staff finds the patient using this
  @Post(':id/patients/search')
  @Roles(Role.HOSPITAL_ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Search for a global patient by National ID or Phone',
  })
  async searchPatient(
    @Param('id') hospitalId: string,
    @Body('identifier') identifier: string,
  ) {
    return this.hospitalsService.searchPatient(identifier);
  }

  // 2. Staff clicks "Register" and triggers this
  @Post(':id/patients/register')
  @Roles(Role.HOSPITAL_ADMIN, Role.RECEPTIONIST)
  @ApiOperation({
    summary: 'Link a global patient to this hospital and generate MRN',
  })
  async registerPatient(
    @Param('id') hospitalId: string,
    @Body('patientId') patientId: string,
  ) {
    return this.hospitalsService.linkPatientToHospital(hospitalId, patientId);
  }

  @Get(':id/doctors')
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST)
  @ApiOperation({ summary: 'List doctors at a specific hospital, optionally filtered by specialty' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'specialty', required: false, example: 'Cardiology' })
  @ApiQuery({ name: 'available', required: false, type: Boolean })
  findDoctors(
    @Param('id') id: string,
    @Query('specialty') specialty?: string,
    @Query('available') available?: string,
  ) {
    const availableBool = available === undefined ? undefined : available === 'true';
    return this.hospitalsService.findDoctors(id, specialty, availableBool);
  }
}

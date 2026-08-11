// backend/src/patients/patients.controller.ts

import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Req,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { SymptomCheckDto } from './dto/symptom-check.dto';
import { GrantConsentDto } from './dto/grant-consent.dto';

@ApiTags('Patients')
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get('profile')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Get patient profile' })
  getProfile(@Req() req: any) {
    return this.patientsService.getProfile(req.user.sub);
  }

  @Put('profile')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Update patient profile' })
  updateProfile(@Req() req: any, @Body() dto: UpdatePatientDto) {
    return this.patientsService.updateProfile(req.user.sub, dto);
  }

  @Get('orders')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Get patient with all orders' })
  getOrders(@Req() req: any) {
    return this.patientsService.getPatientWithOrders(req.user.sub);
  }

  @Get(':mrn/medical-history')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Get complete medical history aggregated and paginated by Patient MRN',
  })
  @ApiParam({ name: 'mrn', description: 'Unique Medical Record Number' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '10' })
  getMasterHistory(
    @Req() req: any,
    @Param('mrn') mrn: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.patientsService.getMasterMedicalHistory(
      mrn,
      req.user,
      page,
      limit,
    );
  }

  @Post('symptom-check')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary:
      'AI-assisted symptom checker with clinical specialty recommendations',
  })
  symptomCheck(@Body() dto: SymptomCheckDto) {
    return this.patientsService.symptomCheck(dto.symptoms);
  }

  @Post('consent')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'Grant temporary 7-day medical history read access to a doctor',
  })
  grantConsent(@Req() req: any, @Body() dto: GrantConsentDto) {
    return this.patientsService.grantConsent(req.user.sub, dto);
  }
}

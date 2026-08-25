import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { InpatientService } from './inpatient.service';
import {
  CreateAdmissionDto,
  CreateHandoverDto,
  LogMarDto,
  LogVitalsDto,
  TransferBedDto,
  UpdateBedStatusDto,
  DischargeAdmissionDto,
} from './dto';

interface AuthenticatedRequest {
  user: {
    sub: string;
    role: string;
  };
}

@ApiTags('Inpatient')
@Controller('inpatient')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InpatientController {
  constructor(private readonly inpatientService: InpatientService) {}

  // =============================================
  // ADMISSIONS
  // =============================================

  @Post('admissions')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Admit a patient (Doctor / Nurse / Admin)',
    description:
      'Creates an inpatient admission record. Both doctors and nurses can admit. ' +
      'The admitter must belong to the target hospital.',
  })
  @ApiResponse({ status: 201, description: 'Admission created' })
  @ApiResponse({
    status: 409,
    description: 'Patient already has an active admission',
  })
  createAdmission(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAdmissionDto,
  ) {
    return this.inpatientService.createAdmission(
      req.user.sub,
      req.user.role,
      dto,
    );
  }

  @Get('admissions')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'List admissions for your hospital' })
  @ApiQuery({ name: 'hospitalId', required: false })
  listAdmissions(
    @Req() req: AuthenticatedRequest,
    @Query('hospitalId') hospitalId?: string,
  ) {
    return this.inpatientService.listAdmissions(
      req.user.sub,
      req.user.role,
      hospitalId,
    );
  }

  @Get('admissions/:id')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Get a single admission with recent vitals, MAR and handovers',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  getAdmission(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.inpatientService.getAdmission(id, req.user.sub, req.user.role);
  }

  @Patch('admissions/:id/clinical-clearance')
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record clinical discharge clearance (Doctor only)',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  grantClinicalClearance(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.inpatientService.grantClinicalClearance(
      id,
      req.user.sub,
      req.user.role,
    );
  }

  @Patch('admissions/:id/discharge')
  @Roles(Role.DOCTOR, Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Discharge an admitted patient (Doctor / Admin), enforcing clearances',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  @ApiResponse({
    status: 200,
    description: 'Patient successfully discharged and bed set to CLEANING.',
  })
  @ApiResponse({ status: 409, description: 'Admission already closed' })
  @ApiResponse({
    status: 400,
    description: 'Missing clinical or billing clearance',
  })
  dischargeAdmission(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DischargeAdmissionDto,
  ) {
    return this.inpatientService.dischargeAdmission(
      id,
      req.user.sub,
      req.user.role,
      dto,
    );
  }

  // =============================================
  // VITALS
  // =============================================

  @Post('admissions/:id/vitals')
  @Roles(Role.NURSE)
  @ApiOperation({
    summary: 'Log ward round vitals for an inpatient (Nurse only)',
    description:
      'Accepts a free-form list of vital readings (any name/value/unit the nurse measures) ' +
      'plus a confirmation checklist of standard checks completed this round.',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  @ApiResponse({ status: 201, description: 'Vitals recorded' })
  @ApiResponse({ status: 409, description: 'Admission is not active' })
  logVitals(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
    @Body() dto: LogVitalsDto,
  ) {
    return this.inpatientService.logVitals(admissionId, req.user.sub, dto);
  }

  @Get('admissions/:id/vitals')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get full vitals timeline for an admission' })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  listVitals(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
  ) {
    return this.inpatientService.listVitals(
      admissionId,
      req.user.sub,
      req.user.role,
    );
  }

  // =============================================
  // MEDICATION ADMINISTRATION RECORD (MAR)
  // Write-once — no PATCH / DELETE
  // =============================================

  @Post('admissions/:id/mar')
  @Roles(Role.NURSE)
  @ApiOperation({
    summary: 'Log a medication administration event (Nurse only)',
    description:
      'Records exactly when a prescribed medication was given, by whom, at what dose. ' +
      'MAR entries are immutable once written to protect medical record integrity.',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  @ApiResponse({ status: 201, description: 'MAR entry created' })
  @ApiResponse({ status: 409, description: 'Admission is not active' })
  logMar(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
    @Body() dto: LogMarDto,
  ) {
    return this.inpatientService.logMar(admissionId, req.user.sub, dto);
  }

  @Get('admissions/:id/mar')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Get the full medication administration log for an admission',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  listMar(@Req() req: AuthenticatedRequest, @Param('id') admissionId: string) {
    return this.inpatientService.listMar(
      admissionId,
      req.user.sub,
      req.user.role,
    );
  }

  // =============================================
  // NURSING SHIFT HANDOVER CHECKLISTS
  // =============================================

  @Post('admissions/:id/handover')
  @Roles(Role.NURSE)
  @ApiOperation({
    summary: 'Submit a nursing shift handover checklist (Nurse only)',
    description:
      'Outgoing nurse completes the structured handover at end of shift. ' +
      'The incoming nurse acknowledges via PATCH .../handover/:handoverId/acknowledge.',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  @ApiResponse({ status: 201, description: 'Handover checklist created' })
  createHandover(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
    @Body() dto: CreateHandoverDto,
  ) {
    return this.inpatientService.createHandover(admissionId, req.user.sub, dto);
  }

  @Get('admissions/:id/handover')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'List all handover checklists for an admission' })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  listHandovers(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
  ) {
    return this.inpatientService.listHandovers(
      admissionId,
      req.user.sub,
      req.user.role,
    );
  }

  @Patch('admissions/:id/handover/:handoverId/acknowledge')
  @Roles(Role.NURSE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Incoming nurse acknowledges a handover checklist',
    description:
      'Records the incoming nurse as the recipient. Self-acknowledgement is rejected.',
  })
  @ApiParam({ name: 'id', description: 'InpatientAdmission UUID' })
  @ApiParam({ name: 'handoverId', description: 'NursingHandover UUID' })
  @ApiResponse({
    status: 409,
    description: 'Already acknowledged or self-acknowledgement',
  })
  acknowledgeHandover(
    @Req() req: AuthenticatedRequest,
    @Param('id') admissionId: string,
    @Param('handoverId') handoverId: string,
  ) {
    return this.inpatientService.acknowledgeHandover(
      admissionId,
      handoverId,
      req.user.sub,
    );
  }

  @Patch('beds/:id/status')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Update bed status (Available, Maintenance, Cleaning, etc.)',
  })
  @ApiResponse({ status: 200, description: 'Bed status successfully updated.' })
  async updateBedStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') bedId: string,
    @Body() dto: UpdateBedStatusDto,
  ) {
    return this.inpatientService.updateBedStatus(
      req.user.sub,
      req.user.role,
      bedId,
      dto,
    );
  }

  @Post('admissions/:id/transfer')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary:
      'Transfer an active inpatient admission to a new bed with audit logging',
  })
  @ApiResponse({
    status: 201,
    description: 'Patient successfully transferred to new bed.',
  })
  async transferBed(
    @Param('id') admissionId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: TransferBedDto,
  ) {
    return this.inpatientService.transferBed(
      admissionId,
      req.user.sub,
      req.user.role,
      dto,
    );
  }

  @Get('hospitals/:hospitalId/occupancy')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Get real-time ward and bed occupancy overview for a hospital',
  })
  @ApiResponse({
    status: 200,
    description: 'Occupancy breakdown retrieved successfully.',
  })
  async getHospitalOccupancyOverview(
    @Req() req: AuthenticatedRequest,
    @Param('hospitalId') hospitalId: string,
  ) {
    return this.inpatientService.getHospitalOccupancyOverview(
      req.user.sub,
      req.user.role,
      hospitalId,
    );
  }
}

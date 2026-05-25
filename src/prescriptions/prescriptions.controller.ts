import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CreatePrescriptionDto, UpdatePrescriptionStatusDto } from './dto';
import { HospitalIssuePrescriptionDto } from './dto/hospital-issue-prescription.dto';

@ApiTags('Prescriptions')
@Controller('prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PrescriptionsController {
  constructor(private prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Upload prescription' })
  create(@Req() req: any, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(req.user.sub, dto);
  }

  @Get('my-prescriptions')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Get patient prescriptions' })
  getMyPrescriptions(@Req() req: any) {
    return this.prescriptionsService.findByPatient(req.user.sub);
  }

  @Get('branch')
  @Roles(Role.PHARMACIST, Role.BRANCH_MANAGER, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Get prescriptions linked to branch (Pharmacist)' })
  getBranchPrescriptions(@Req() req: any, @Query('status') status?: string) {
    return this.prescriptionsService.findByBranch(req.user.sub, status);
  }

  @Get('patient/:mrn')
  @Roles(Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.NURSE, Role.PATIENT)
  @ApiOperation({
    summary: 'Get prescriptions for a patient by MRN (scoped to hospital)',
  })
  findByPatientMrn(
    @Param('mrn') mrn: string,
    @Query('hospitalId') hospitalId: string,
  ) {
    return this.prescriptionsService.findByPatientMrn(mrn, hospitalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prescription by ID' })
  getPrescriptionById(@Param('id') id: string) {
    return this.prescriptionsService.findById(id);
  }

  @Put(':id/status')
  @Roles(Role.PHARMACY, Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Update prescription status (Pharmacy)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionStatusDto,
  ) {
    return this.prescriptionsService.updateStatus(id, dto);
  }

  @Post('hospital-issue')
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue hospital prescription with stock check + pharmacy fallback (Doctor only)' })
  async issueHospitalPrescription(
    @Req() req: any,
    @Body() dto: HospitalIssuePrescriptionDto,
  ) {
    return this.prescriptionsService.emitHospitalDigitalPrescription(req.user.sub, dto);
  }

  @Post(':id/dispatch-external')
  @Roles(Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.NURSE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispatch out-of-stock items to external E-Vuze pharmacies (409 if already dispatched)',
  })
  dispatchExternal(@Param('id') id: string) {
    return this.prescriptionsService.dispatchExternal(id);
  }

}

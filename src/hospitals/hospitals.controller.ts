import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { InvoicesService } from '../invoices/invoices.service';
import { HospitalDto } from './dto/hospital.dto';
import { UpdateDrugStockDto } from './dto/update-drug-stock.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { UpdateLeaveStatusDto } from '../doctors/dto/update-leave-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { LogPostOpReportDto } from './dto/surgery-scheduling.dto';

@ApiTags('Hospitals')
@Controller('hospitals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class HospitalsController {
  constructor(
    private readonly hospitalsService: HospitalsService,
    private readonly invoicesService: InvoicesService,
  ) { }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get all hospitals' })
  @ApiOkResponse({ type: [HospitalDto], description: 'List of all hospitals' })
  findAll() {
    return this.hospitalsService.findAll();
  }

  @Get('leave-requests')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary:
      'List all doctor leave requests for your hospital (Hospital Admin only)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    description: 'Filter by leave status',
  })
  getLeaveRequests(@Req() req: any, @Query('status') status?: string) {
    return this.hospitalsService.getLeaveRequests(req.user.sub, status);
  }

  @Patch('leave-requests/:id/status')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary:
      'Approve or reject a doctor leave request. Approval auto-cancels affected appointments and triggers refunds. (Hospital Admin only)',
  })
  @ApiParam({ name: 'id', description: 'DoctorLeave UUID' })
  updateLeaveStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveStatusDto,
  ) {
    return this.hospitalsService.updateLeaveStatus(req.user.sub, id, dto);
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

  @Patch(':id')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary:
      'Update this hospital\'s profile (name, address, phone). Hospital admin can only update their own hospital.',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiOkResponse({ type: HospitalDto, description: 'Updated hospital details' })
  @ApiNotFoundResponse({ description: 'Hospital not found' })
  updateProfile(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateHospitalDto,
  ) {
    return this.hospitalsService.updateProfile(id, req.user.sub, dto);
  }

  @Get(':id/patients')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({
    summary: 'Get all patients registered at this hospital. Optionally filter by doctorId.',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'doctorId', required: false, description: 'Doctor UUID to filter patients by appointments' })
  getHospitalPatients(
    @Param('id') id: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.hospitalsService.getHospitalPatients(id, doctorId);
  }

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

  @Get(':id/invoices')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List invoices for a hospital (paginated, filterable)',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['UNPAID', 'PAID', 'INSURANCE_PENDING'],
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getInvoices(
    @Req() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoicesService.findByHospital(
      id,
      req.user.sub,
      req.user.role,
      {
        status,
        from,
        to,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Get(':id/doctors')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PATIENT,
    Role.HOSPITAL_ADMIN,
    Role.DOCTOR,
    Role.NURSE,
    Role.RECEPTIONIST,
  )
  @ApiOperation({
    summary:
      'List doctors at a specific hospital, optionally filtered by specialty',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'specialty', required: false, example: 'Cardiology' })
  @ApiQuery({ name: 'available', required: false, type: Boolean })
  findDoctors(
    @Param('id') id: string,
    @Query('specialty') specialty?: string,
    @Query('available') available?: string,
  ) {
    const availableBool =
      available === undefined ? undefined : available === 'true';
    return this.hospitalsService.findDoctors(id, specialty, availableBool);
  }

  @Get(':id/departments')
  @Roles(
    Role.SUPER_ADMIN,
    Role.HOSPITAL_ADMIN,
    Role.DOCTOR,
    Role.NURSE,
    Role.RECEPTIONIST,
  )
  @ApiOperation({
    summary:
      'List departments at a hospital, derived from doctor specializations',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getDepartments(@Param('id') id: string) {
    return this.hospitalsService.getDepartments(id);
  }

  @Get(':id/dashboard/stats')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get hospital dashboard stats' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getStats(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getStats(id, req.user.sub);
  }

  @Get(':id/dashboard/daily-appointments')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Get hospital daily appointments throughput for the last 30 days',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getDailyAppointments(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getDailyAppointments(id, req.user.sub);
  }

  @Get(':id/dashboard/weekly-revenue')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get hospital weekly revenue for the last 4 weeks' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getWeeklyRevenue(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getWeeklyRevenue(id, req.user.sub);
  }

  @Post(':id/surgery-bookings/:bookingId/post-op')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({
    summary: 'Log post-operation report and complete surgery',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'bookingId', description: 'Surgery Booking UUID' })
  logPostOpReport(
    @Param('id') hospitalId: string,
    @Param('bookingId') bookingId: string,
    @Req() req: any,
    @Body() dto: LogPostOpReportDto,
  ) {
    return this.hospitalsService.logPostOpReport(
      hospitalId,
      req.user.sub,
      bookingId,
      dto,
    );
  }

  // ========================================
  // DRUG STOCK MANAGEMENT
  // ========================================

  @Get(':id/drug-stock')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.PHARMACIST)
  @ApiOperation({
    summary:
      'List all drugs in hospital inventory with stock levels and alerts',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getDrugStock(@Param('id') id: string) {
    return this.hospitalsService.getDrugStock(id);
  }

  @Patch(':id/drug-stock/:drugId')
  @Roles(Role.HOSPITAL_ADMIN, Role.PHARMACIST)
  @ApiOperation({
    summary: 'Update drug stock quantity or reorder level',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'drugId', description: 'MedicationRegistry drug UUID' })
  updateDrugStock(
    @Param('id') id: string,
    @Param('drugId') drugId: string,
    @Body() dto: UpdateDrugStockDto,
  ) {
    return this.hospitalsService.updateDrugStock(id, drugId, dto);
  }
}

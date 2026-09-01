import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
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
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST)
  @ApiOperation({
    summary: 'Get all patients registered at this hospital. Optionally filter by doctorId.',
  })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'doctorId', required: false, description: 'Doctor UUID to filter patients by appointments' })
  getHospitalPatients(
    @Param('id') id: string,
    @Req() req: any,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.hospitalsService.getHospitalPatients(id, req.user.sub, doctorId);
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
  // RECEPTIONIST PORTAL
  // ========================================

  @Get(':id/receptionist/queue')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.NURSE, Role.DOCTOR)
  @ApiOperation({ summary: 'Get today\'s patient queue for the receptionist portal' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistQueue(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistQueue(id, req.user.sub);
  }

  @Get(':id/receptionist/dashboard-stats')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.NURSE, Role.DOCTOR)
  @ApiOperation({ summary: 'Get appointment status counts for the receptionist queue page' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistDashboardStats(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistDashboardStats(id, req.user.sub);
  }

  @Get(':id/receptionist/dashboard')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.NURSE, Role.DOCTOR)
  @ApiOperation({ summary: 'Get receptionist dashboard data (charts, queue, today\'s appointments)' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistDashboard(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistDashboard(id, req.user.sub);
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
  @ApiOperation({ summary: 'Update drug stock quantity or reorder level' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'drugId', description: 'MedicationRegistry drug UUID' })
  updateDrugStock(
    @Param('id') id: string,
    @Param('drugId') drugId: string,
    @Body() dto: UpdateDrugStockDto,
  ) {
    return this.hospitalsService.updateDrugStock(id, drugId, dto);
  }

  // ========================================
  // HOSPITAL STAFF LISTING
  // ========================================

  @Get(':id/staff')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all nurses and receptionists for this hospital' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getHospitalStaff(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getHospitalStaff(id, req.user.sub);
  }

  // ========================================
  // NURSE PORTAL
  // ========================================

  @Get(':id/nurse/dashboard')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get nurse dashboard stats for this hospital' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getNurseDashboard(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getNurseDashboard(id, req.user.sub);
  }

  @Get(':id/nurse/vitals')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get all vitals recorded today (or a given date) across all admissions' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'date', required: false, description: 'ISO date (defaults to today)' })
  getNurseVitals(@Param('id') id: string, @Req() req: any, @Query('date') date?: string) {
    return this.hospitalsService.getNurseVitals(id, req.user.sub, date);
  }

  @Get(':id/nurse/mar')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get all MAR records for a given date across all admissions' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'date', required: false, description: 'ISO date (defaults to today)' })
  getNurseMar(@Param('id') id: string, @Req() req: any, @Query('date') date?: string) {
    return this.hospitalsService.getNurseMar(id, req.user.sub, date);
  }

  // ========================================
  // RECEPTIONIST — APPOINTMENTS
  // ========================================

  @Get(':id/receptionist/appointments')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Get today's appointments for the receptionist portal" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistAppointments(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistAppointments(id, req.user.sub);
  }

  @Patch(':id/receptionist/appointments/:appointmentId')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Check-in, cancel, or reschedule a patient appointment' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'appointmentId', description: 'Appointment UUID' })
  updateReceptionistAppointment(
    @Param('id') id: string,
    @Param('appointmentId') appointmentId: string,
    @Req() req: any,
    @Body() dto: { status?: string; scheduledAt?: string },
  ) {
    return this.hospitalsService.updateReceptionistAppointment(id, req.user.sub, appointmentId, dto);
  }

  // ========================================
  // RECEPTIONIST — PROFILE
  // ========================================

  @Get(':id/receptionist/profile')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Get the calling receptionist's staff profile" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistProfile(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistProfile(id, req.user.sub);
  }

  @Patch(':id/receptionist/profile')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Update the calling receptionist's staff profile" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  updateReceptionistProfile(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { firstName?: string; lastName?: string; phone?: string; department?: string },
  ) {
    return this.hospitalsService.updateReceptionistProfile(id, req.user.sub, dto);
  }

  // ========================================
  // RECEPTIONIST — LEAVE REQUESTS
  // ========================================

  @Get(':id/receptionist/leaves')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Get the receptionist's leave request history" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistLeaves(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistLeaves(id, req.user.sub);
  }

  @Post(':id/receptionist/leaves')
  @Roles(Role.RECEPTIONIST)
  @ApiOperation({ summary: 'Submit a new leave request' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  createReceptionistLeave(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { leaveType: string; startDate: string; endDate: string; reason?: string; fileName?: string },
  ) {
    return this.hospitalsService.createReceptionistLeave(id, req.user.sub, dto);
  }

  @Patch(':id/receptionist/leaves/:leaveId')
  @Roles(Role.RECEPTIONIST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'leaveId', description: 'StaffLeave UUID' })
  cancelReceptionistLeave(
    @Param('id') id: string,
    @Param('leaveId') leaveId: string,
    @Req() req: any,
  ) {
    return this.hospitalsService.cancelReceptionistLeave(id, req.user.sub, leaveId);
  }

  // ========================================
  // RECEPTIONIST — NOTIFICATIONS
  // ========================================

  @Get(':id/receptionist/notifications')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Get the receptionist's notification feed" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getReceptionistNotifications(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getReceptionistNotifications(id, req.user.sub);
  }

  @Patch(':id/receptionist/notifications/read-all')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  markAllNotificationsRead(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.markAllNotificationsRead(id, req.user.sub);
  }

  @Patch(':id/receptionist/notifications/:notifId/read')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'notifId', description: 'Notification UUID' })
  markNotificationRead(
    @Param('id') id: string,
    @Param('notifId') notifId: string,
    @Req() req: any,
  ) {
    return this.hospitalsService.markNotificationRead(id, req.user.sub, notifId);
  }

  // ========================================
  // WALK-IN (Receptionist)
  // ========================================

  @Post(':id/receptionist/walkin')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Create a walk-in appointment and return a queue number' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  createWalkIn(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { patientId: string; department?: string; visitReason?: string; insuranceProvider?: string; doctorId?: string },
  ) {
    return this.hospitalsService.createWalkIn(id, req.user.sub, dto);
  }

  // ========================================
  // NURSE SCHEDULE
  // ========================================

  @Get(':id/nurse/schedule')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get nurse shift schedule (daily/weekly/monthly)' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'view', required: false, enum: ['daily', 'weekly', 'monthly'] })
  @ApiQuery({ name: 'date', required: false, description: 'ISO date string' })
  getNurseSchedule(
    @Param('id') id: string,
    @Req() req: any,
    @Query('view') view?: string,
    @Query('date') date?: string,
  ) {
    return this.hospitalsService.getNurseSchedule(id, req.user.sub, view ?? 'daily', date);
  }

  // ========================================
  // NURSE NOTES
  // ========================================

  @Get(':id/nurse/notes')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get nursing notes for this hospital' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'patientId', required: false })
  getNurseNotes(
    @Param('id') id: string,
    @Req() req: any,
    @Query('date') date?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.hospitalsService.getNurseNotes(id, req.user.sub, date, patientId);
  }

  @Post(':id/nurse/notes')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Create a new nursing note' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  createNurseNote(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { patientId?: string; observationNotes: string; careActivities?: string; additionalComments?: string; noteDate?: string },
  ) {
    return this.hospitalsService.createNurseNote(id, req.user.sub, dto);
  }

  // ========================================
  // NURSE PROFILE
  // ========================================

  @Get(':id/nurse/profile')
  @Roles(Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: "Get the calling nurse's staff profile" })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getNurseProfile(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getNurseProfile(id, req.user.sub);
  }

  // ========================================
  // INVOICE SUMMARY
  // ========================================

  @Get(':id/invoices/summary')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get invoice financial summary (KPIs) for admin finance page' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getInvoiceSummary(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getInvoiceSummary(id, req.user.sub);
  }

  // ========================================
  // HOSPITAL FEES
  // ========================================

  @Get(':id/fees')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN, Role.NURSE, Role.RECEPTIONIST, Role.DOCTOR)
  @ApiOperation({ summary: 'List hospital service fees' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getHospitalFees(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getHospitalFees(id, req.user.sub);
  }

  @Post(':id/fees')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Create a new hospital service fee' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  createHospitalFee(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { service: string; price: number; status?: string },
  ) {
    return this.hospitalsService.createHospitalFee(id, req.user.sub, dto);
  }

  @Patch(':id/fees/:feeId')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Update a hospital service fee' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'feeId', description: 'HospitalFee UUID' })
  updateHospitalFee(
    @Param('id') id: string,
    @Param('feeId') feeId: string,
    @Req() req: any,
    @Body() dto: { service?: string; price?: number; status?: string },
  ) {
    return this.hospitalsService.updateHospitalFee(id, req.user.sub, feeId, dto);
  }

  @Delete(':id/fees/:feeId')
  @Roles(Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a hospital service fee' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'feeId', description: 'HospitalFee UUID' })
  deleteHospitalFee(
    @Param('id') id: string,
    @Param('feeId') feeId: string,
    @Req() req: any,
  ) {
    return this.hospitalsService.deleteHospitalFee(id, req.user.sub, feeId);
  }

  // ========================================
  // HOSPITAL ANNOUNCEMENTS
  // ========================================

  @Get(':id/announcements')
  @Roles(Role.HOSPITAL_ADMIN, Role.NURSE, Role.RECEPTIONIST, Role.DOCTOR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List hospital announcements' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getHospitalAnnouncements(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getHospitalAnnouncements(id, req.user.sub);
  }

  @Post(':id/announcements')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Create a new hospital announcement' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  createHospitalAnnouncement(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { title: string; type?: string; message?: string },
  ) {
    return this.hospitalsService.createHospitalAnnouncement(id, req.user.sub, dto);
  }

  @Delete(':id/announcements/:annId')
  @Roles(Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a hospital announcement' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  @ApiParam({ name: 'annId', description: 'HospitalAnnouncement UUID' })
  deleteHospitalAnnouncement(
    @Param('id') id: string,
    @Param('annId') annId: string,
    @Req() req: any,
  ) {
    return this.hospitalsService.deleteHospitalAnnouncement(id, req.user.sub, annId);
  }

  // ========================================
  // HOSPITAL STAFF MESSAGES
  // ========================================

  @Get(':id/messages')
  @Roles(Role.NURSE, Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get all internal hospital staff messages' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getHospitalMessages(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getHospitalMessages(id, req.user.sub);
  }

  @Post(':id/messages')
  @Roles(Role.NURSE, Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Send an internal hospital staff message' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  sendHospitalMessage(
    @Param('id') id: string,
    @Req() req: any,
    @Body('content') content: string,
  ) {
    return this.hospitalsService.sendHospitalMessage(id, req.user.sub, content);
  }
}

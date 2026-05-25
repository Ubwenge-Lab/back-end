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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Hospitals')
@Controller('hospitals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class HospitalsController {
  constructor(
    private readonly hospitalsService: HospitalsService,
    private readonly invoicesService: InvoicesService,
  ) {}

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

  @Get(':id/dashboard/stats')
  @Roles(Role.HOSPITAL_ADMIN)
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
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get hospital weekly revenue for the last 4 weeks' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  getWeeklyRevenue(@Param('id') id: string, @Req() req: any) {
    return this.hospitalsService.getWeeklyRevenue(id, req.user.sub);
  }

  // ========================================
  // DRUG STOCK MANAGEMENT
  // ========================================

  @Get(':id/drug-stock')
  @Roles(Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.PHARMACIST)
  @ApiOperation({
    summary: 'List all drugs in hospital inventory with stock levels and alerts',
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

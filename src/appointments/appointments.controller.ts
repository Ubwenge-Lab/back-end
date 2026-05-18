import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto, UpdateAppointmentStatusDto, CompleteConsultDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ========================================
  // POST /appointments/book — patient books a slot
  // ========================================

  @Post('book')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Book an appointment (Patient only)' })
  book(@Req() req: any, @Body() dto: BookAppointmentDto) {
    return this.appointmentsService.book(req.user.sub, dto);
  }

  // ========================================
  // GET /appointments — role-scoped list
  // ========================================

  @Get()
  @Roles(Role.PATIENT, Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "List appointments (scoped to the caller's role)" })
  findAll(@Req() req: any) {
    return this.appointmentsService.findAll(req.user.sub, req.user.role);
  }

  // ========================================
  // GET /appointments/:id
  // ========================================

  @Get(':id')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a single appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.appointmentsService.findOne(id, req.user.sub, req.user.role);
  }

  // ========================================
  // POST /appointments/:id/consult — doctor completes consult, auto-generates invoice
  // ========================================

  @Post(':id/consult')
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete consultation and generate invoice (Doctor only)' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  completeConsult(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CompleteConsultDto,
  ) {
    return this.appointmentsService.completeConsult(id, req.user.sub, dto);
  }

  // ========================================
  // PATCH /appointments/:id/cancel — patient cancels their own
  // ========================================

  @Patch(':id/cancel')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment (Patient only)' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.appointmentsService.cancel(id, req.user.sub);
  }

  // ========================================
  // PATCH /appointments/:id/status — doctor or admin updates status
  // ========================================

  @Patch(':id/status')
  @Roles(Role.DOCTOR, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Update appointment status — COMPLETED, NO_SHOW, etc. (Doctor / Admin)',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      id,
      req.user.sub,
      req.user.role,
      dto,
    );
  }
}

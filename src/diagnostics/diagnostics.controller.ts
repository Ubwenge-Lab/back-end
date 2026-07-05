// backend/src/diagnostics/diagnostics.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DiagnosticsService } from './diagnostics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CreateDiagnosticOrderDto, UpdateDiagnosticOrderFindingsDto } from './dto';
import { DiagnosticStatus } from '@prisma/client';

@ApiTags('Diagnostics')
@Controller('diagnostics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  // 1. Doctor requests a diagnostic test
  @Post('orders')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Request a diagnostic order (Doctor only)' })
  create(@Req() req: any, @Body() dto: CreateDiagnosticOrderDto) {
    return this.diagnosticsService.create(req.user.sub, dto);
  }

  // 2. Technicians and Hospital Staff view the queue
  @Get('queue')
  @Roles(Role.TECHNICIAN, Role.HOSPITAL_ADMIN, Role.NURSE, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'View the diagnostic orders queue (Technician/Admin/Nurse only)' })
  @ApiQuery({ name: 'status', required: false, enum: DiagnosticStatus })
  getQueue(@Query('status') status?: DiagnosticStatus) {
    return this.diagnosticsService.getQueue(status);
  }

  // 3. View patient diagnostic history
  @Get('patient/:patientId')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.NURSE, Role.TECHNICIAN, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get patient diagnostic records history' })
  getPatientHistory(@Param('patientId') patientId: string) {
    return this.diagnosticsService.getPatientHistory(patientId);
  }

  // 4. Technician reports findings and finalizes results
  @Put('orders/:id/findings')
  @Roles(Role.TECHNICIAN, Role.HOSPITAL_ADMIN, Role.NURSE, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Input findings, results, and upload report files (Technician/Admin/Nurse only)' })
  updateFindings(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateDiagnosticOrderFindingsDto,
  ) {
    return this.diagnosticsService.updateFindings(id, req.user.sub, dto);
  }

  // 5. Secure file retrieval with validation returning pre-signed S3 URL
  @Get('orders/:id/secure-file')
  @Roles(
    Role.PATIENT,
    Role.DOCTOR,
    Role.TECHNICIAN,
    Role.HOSPITAL_ADMIN,
    Role.NURSE,
    Role.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Retrieve secure, pre-signed AWS S3 URL for diagnostic attachments (Authorized roles only)' })
  getSecureFileUrl(@Param('id') id: string, @Req() req: any) {
    return this.diagnosticsService.getSecureFileUrl(id, req.user.sub);
  }
}

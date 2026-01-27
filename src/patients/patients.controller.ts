// backend/src/patients/patients.controller.ts

import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

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
}
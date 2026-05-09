import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Doctors')
@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @Roles(Role.PATIENT, Role.SUPER_ADMIN, Role.PHARMACY, Role.DOCTOR)
  @ApiOperation({ 
    summary: 'Get all doctors with optional filters',
    description: 'Filter doctors by specialty and/or hospital ID' 
  })
  @ApiQuery({ name: 'specialty', required: false, description: 'Filter by medical specialty' })
  @ApiQuery({ name: 'hospital_id', required: false, description: 'Filter by hospital ID' })
  @ApiOkResponse({ description: 'List of doctors matching filters' })
  findAll(@Query() query: DoctorQueryDto) {
    return this.doctorsService.findAll(query);
  }
}

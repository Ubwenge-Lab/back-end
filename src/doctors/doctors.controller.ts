import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { UpdateDoctorDto, DoctorFilterDto } from './dto';
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
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST)
  @ApiOperation({ summary: 'List all doctors with optional specialty / availability filter' })
  @ApiQuery({ name: 'specialty', required: false, example: 'Cardiology' })
  @ApiQuery({ name: 'available', required: false, type: Boolean })
  findAll(@Query() filters: DoctorFilterDto) {
    return this.doctorsService.findAll(filters);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.PATIENT, Role.HOSPITAL_ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST)
  @ApiOperation({ summary: 'Get a single doctor profile' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Update a doctor profile — specialty, bio, rating, availability (Hospital Admin only)' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @Roles(Role.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a doctor from your hospital (Hospital Admin only)' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.doctorsService.remove(req.user.sub, id);
  }
}

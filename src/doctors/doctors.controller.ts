import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { DoctorResponseDto } from './dto/doctor-response.dto';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all doctors',
    description: 'Retrieve a list of doctors with optional filtering by specialty and hospital',
  })
  @ApiQuery({
    name: 'specialty',
    required: false,
    description: 'Filter by doctor specialty (e.g., Cardiology)',
  })
  @ApiQuery({
    name: 'hospital_id',
    required: false,
    description: 'Filter by hospital ID',
  })
  @ApiResponse({
    status: 200,
    description: 'List of doctors',
    type: [DoctorResponseDto],
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  findAll(@Query() query: DoctorQueryDto) {
    return this.doctorsService.findAll(query);
  }
}
import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiExtraModels } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { GetDoctorsQueryDto } from './dto/get-doctors-query.dto';
import { DoctorDto } from './dto/doctor.dto';

@ApiTags('Doctors')
@ApiExtraModels(DoctorDto)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all doctors with optional filtering' })
  @ApiOkResponse({
    description: 'List of doctors successfully retrieved.',
    type: [DoctorDto],
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  findAll(@Query() query: GetDoctorsQueryDto) {
    return this.doctorsService.findAll(query);
  }
}

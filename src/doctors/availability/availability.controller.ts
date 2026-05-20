import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { GetAvailabilityDto } from '../dto/get-availability.dto';

@Controller('doctors')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get(':id/slots')
  async getAvailableSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetAvailabilityDto,
  ) {
    return this.availabilityService.calculateSlots(id, query.date);
  }
}

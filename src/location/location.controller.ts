import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@ApiTags('Location')
@Controller('location')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('verify')
  @ApiOperation({ summary: 'Verify coordinates or fallback to Database address geopolygon' })
  @ApiQuery({ name: 'latitude', required: false, type: Number })
  @ApiQuery({ name: 'longitude', required: false, type: Number })
  async verifyFallback(
    @Req() req: any,
    @Query('latitude') activeLat?: string,
    @Query('longitude') activeLon?: string,
  ) {
    const lat = activeLat ? parseFloat(activeLat) : undefined;
    const lon = activeLon ? parseFloat(activeLon) : undefined;

    // req.user typically contains { sub: userId, email, role } populated by your JWT config
    const fallbackLocation = await this.locationService.verifyAndFallbackCoordinates(
      req.user.sub,
      req.user.role,
      lat,
      lon
    );

    if (!fallbackLocation) {
      return {
        success: false,
        message: 'No active coordinates provided, and Database fallback address failed to yield a valid mapped location.',
        location: null
      };
    }

    return {
      success: true,
      message: 'Location mapped successfully.',
      source: (lat && lon && !isNaN(lat)) ? 'ACTIVE_GPS' : 'DATABASE_FALLBACK_GEOCODED',
      location: fallbackLocation
    };
  }
}

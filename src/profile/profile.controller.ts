import { Body, Controller, Get, Put, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestContactCodeDto } from './dto/request-contact-code.dto';
import { VerifyContactChangeDto } from './dto/verify-contact-change.dto';

@ApiTags('Profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the signed-in user profile (all roles)' })
  getMe(@Req() req: any) {
    return this.profileService.getMe(req.user.sub);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update name / country / locale preferences' })
  updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateMe(req.user.sub, dto);
  }

  @Post('contact-code')
  @ApiOperation({
    summary: 'Request an OTP code to change email/phone (sent to the new contact)',
  })
  requestContactCode(@Req() req: any, @Body() dto: RequestContactCodeDto) {
    return this.profileService.requestContactCode(req.user.sub, dto);
  }

  @Put('contact')
  @ApiOperation({ summary: 'Verify the OTP and apply the email/phone change' })
  verifyContactChange(@Req() req: any, @Body() dto: VerifyContactChangeDto) {
    return this.profileService.verifyContactChange(req.user.sub, dto);
  }
}

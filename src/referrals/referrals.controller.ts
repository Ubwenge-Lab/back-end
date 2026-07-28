import { Controller, Post, Body, Req, UseGuards, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @Roles(Role.DOCTOR)
  @ApiOperation({
    summary: 'Create an outbound patient referral (Doctor only)',
  })
  @ApiResponse({ status: 201, description: 'Referral created.' })
  @ApiResponse({
    status: 404,
    description: 'Patient or target hospital not found.',
  })
  @ApiResponse({
    status: 403,
    description: 'Only doctors can create a referral.',
  })
  create(@Req() req: any, @Body() dto: CreateReferralDto) {
    return this.referralsService.createReferral(req.user.sub, dto);
  }

  @Post(':id/package')
  @Roles(Role.DOCTOR)
  @ApiOperation({
    summary: 'Generate the EMR export package for a referral (Doctor only)',
  })
  @ApiResponse({ status: 200, description: 'Referral packaged.' })
  @ApiResponse({ status: 404, description: 'Referral not found.' })
  @ApiResponse({
    status: 403,
    description: 'Only the authorizing doctor can package this referral.',
  })
  @ApiResponse({
    status: 409,
    description: 'Referral has already been packaged.',
  })
  package(@Req() req: any, @Param('id') id: string) {
    return this.referralsService.packageReferral(id, req.user.sub);
  }

  @Post(':id/send')
  @Roles(Role.DOCTOR)
  @ApiOperation({
    summary:
      'Send the signed referral webhook to the target hospital (Doctor only)',
  })
  @ApiResponse({ status: 200, description: 'Referral sent.' })
  @ApiResponse({
    status: 400,
    description:
      'Referral not packaged yet, or target hospital has no webhook configured.',
  })
  send(@Req() req: any, @Param('id') id: string) {
    return this.referralsService.sendReferralWebhook(id, req.user.sub);
  }
}

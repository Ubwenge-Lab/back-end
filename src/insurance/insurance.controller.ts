// backend/src/insurance/insurance.controller.ts

import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InsuranceService } from './insurance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { VerifyInsuranceDto } from './dto/verify-insurance.dto';

@ApiTags('Insurance')
@Controller('insurance')
export class InsuranceController {
  constructor(private insuranceService: InsuranceService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Get supported insurance providers' })
  getSupportedProviders() {
    return this.insuranceService.getSupportedProviders();
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify insurance' })
  verifyInsurance(@Req() req: any, @Body() dto: VerifyInsuranceDto) {
    return this.insuranceService.verifyInsurance(req.user.sub, dto);
  }
}

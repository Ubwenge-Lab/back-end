// backend/src/payments/payments.controller.ts

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import {
  InitiatePaymentDto,
  VerifyPaymentDto,
  MobileMoneyPaymentDto,
  CheckoutDto,
} from './dto';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('initiate')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Initiate payment' })
  initiatePayment(@Body() dto: InitiatePaymentDto) {
    return this.paymentsService.initiatePayment(dto);
  }

  @Post('verify')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Verify payment' })
  verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto);
  }

  @Post('validate-otp')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Validate mobile money OTP' })
  validateOTP(@Body() dto: MobileMoneyPaymentDto) {
    return this.paymentsService.validateOTP(dto.paymentId, dto.otp);
  }

  @Post('checkout')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'Checkout — create order and initiate payment in one step',
  })
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.paymentsService.checkout(req.user.sub, dto);
  }
}

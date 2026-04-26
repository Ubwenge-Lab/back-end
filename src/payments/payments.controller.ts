// backend/src/payments/payments.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { MtnCallbackDto } from './dto/mtn-callback.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  InitiatePaymentDto,
  VerifyPaymentDto,
  MobileMoneyPaymentDto,
  CheckoutDto,
  RecordPaymentDto,
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

  @Get('verify/:orderId')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.SUPER_ADMIN)
  manualVerify(@Param('orderId') orderId: string, @Req() req) {
    return this.paymentsService.manualVerifyByOrderId(orderId, req.user);
  }

  @Get('cashier/recent')
  @Roles(Role.CASHIER, Role.PHARMACIST, Role.SUPER_ADMIN)
  getRecentPayments() {
    return this.paymentsService.getRecentSuccessfulPayments();
  }

  @Public() // This tells NestJS: "Don't require a login for this specific URL"
  @Post('webhook/mtn')
  async handleMtnWebhook(@Body() data: MtnCallbackDto) {
    console.log('Received MTN Webhook:', data);
    return this.paymentsService.processMtnPayment(data);
  }

  @Post('checkout')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'Checkout — create order and initiate payment in one step',
  })
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.paymentsService.checkout(req.user.sub, dto);
  }

  @Post('record')
  @Roles(Role.CASHIER, Role.PHARMACIST, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Record in-person payment collection',
    description:
      'Records cash, card, or manual MoMo payments collected at the counter. Creates a completed payment and updates order status atomically.',
  })
  recordPayment(@Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.recordPayment(req.user.sub, dto);
  }
}

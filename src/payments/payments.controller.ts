// backend/src/payments/payments.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { MtnCallbackDto } from './dto/mtn-callback.dto';
import { HospitalPaymentWebhookDto } from './dto/hospital-payment-webhook.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  InitiatePaymentDto,
  VerifyPaymentDto,
  MobileMoneyPaymentDto,
  CheckoutDto,
  RecordPaymentDto,
} from './dto';
import { CreateCheckoutSessionDto, MockWebhookDto } from './dto/payments.dto';

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

  @Public()
  @Post('webhook/mtn')
  async handleMtnWebhook(@Body() data: MtnCallbackDto) {
    console.log('Received MTN Webhook:', data);
    return this.paymentsService.processMtnPayment(data);
  }

  @Public()
  @Post('webhook/hospital')
  @ApiOperation({ summary: 'Mock hospital invoice payment webhook' })
  async handleHospitalWebhook(@Body() data: HospitalPaymentWebhookDto) {
    return this.paymentsService.processHospitalPaymentWebhook(data);
  }

  @Get(':paymentId/receipt')
  @Roles(Role.CASHIER, Role.PHARMACIST, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get payment receipt' })
  getReceipt(@Param('paymentId') paymentId: string, @Req() req: any) {
    // req.user.sub contains the authenticated User ID
    return this.paymentsService.getReceipt(paymentId, req.user.sub);
  }

  @Post('checkout')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'Checkout — create order and initiate payment in one step',
  })
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.paymentsService.checkout(req.user.sub, dto);
  }


  @Post('checkout-session')
  @HttpCode(HttpStatus.CREATED)
  createSession(@Body() dto: CreateCheckoutSessionDto) {
    return this.paymentsService.createCheckoutSession(dto);
  }

  @Post('webhook/mock-callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  handleCallback(@Body() dto: MockWebhookDto) {
    return this.paymentsService.handleMockWebhookCallback(dto);
  }

  @Post('record')
  @Roles(Role.CASHIER, Role.PHARMACIST, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Record an in-person payment at the branch counter',
  })
  recordPayment(@Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.recordPayment(req.user.sub, dto);
  }
}

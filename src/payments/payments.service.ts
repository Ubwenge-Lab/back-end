// backend/src/payments/payments.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FlutterwaveService } from './flutterwave.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import {
  InitiatePaymentDto,
  VerifyPaymentDto,
  MobileMoneyPaymentDto,
  CheckoutDto,
} from './dto';
import { MtnCallbackDto } from './dto/mtn-callback.dto';
import { CreateOrderDto } from '../orders/dto';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private flutterwaveService: FlutterwaveService,
    private notificationsService: NotificationsService,
    private ordersService: OrdersService,
  ) {}

  // ========================================
  // INITIATE PAYMENT
  // ========================================

  async initiatePayment(dto: InitiatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        patient: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === 'COMPLETED') {
      throw new BadRequestException('Order already paid');
    }

    // After finding the order, add:
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot pay for cancelled order');
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: order.patientPayment,
        paymentMethod: order.paymentMethod,
        status: 'PENDING',
        insuranceProvider: dto.insuranceProvider,
        insurancePolicyNumber: dto.insurancePolicyNumber,
        insuranceCoverage: order.insuranceCoverage,
        insuranceVerified: dto.insuranceVerified || false,
      },
    });

    // Initialize payment based on method
    let paymentResponse;

    switch (order.paymentMethod) {
      case 'MTN_MOMO':
      case 'AIRTEL_MONEY':
        if (!dto.phoneNumber) {
          throw new BadRequestException(
            'Phone number is required for mobile money payments',
          );
        }
        paymentResponse = await this.flutterwaveService.chargeMobileMoney({
          orderId: order.orderNumber,
          amount: order.patientPayment,
          phoneNumber: dto.phoneNumber,
          provider: order.paymentMethod === 'MTN_MOMO' ? 'MTN' : 'AIRTEL',
          customerEmail: order.patient.user.email,
          customerName: `${order.patient.firstName} ${order.patient.lastName}`,
        });
        break;

      case 'CARD':
        paymentResponse = await this.flutterwaveService.initializePayment({
          orderId: order.orderNumber,
          amount: order.patientPayment,
          customerEmail: order.patient.user.email,
          customerName: `${order.patient.firstName} ${order.patient.lastName}`,
          customerPhone: order.patient.phone,
          paymentMethod: 'CARD',
        });
        break;

      case 'INSURANCE':
        // Insurance payment - already calculated
        paymentResponse = {
          status: 'success',
          message: 'Insurance coverage applied',
        };
        break;
    }

    // Update payment with response
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        flutterwaveRef: paymentResponse.data?.flw_ref,
        paymentResponse: paymentResponse,
      },
    });

    return {
      paymentId: payment.id,
      ...paymentResponse,
    };
  }

  // ========================================
  // VERIFY PAYMENT
  // ========================================

  async verifyPayment(dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: {
        order: {
          include: {
            patient: true,
            pharmacy: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify with Flutterwave
    const verification = await this.flutterwaveService.verifyPayment(
      dto.transactionId,
    );

    if (verification.data.status === 'successful') {
      // Update payment
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          transactionId: dto.transactionId,
          paymentResponse: verification,
        },
      });
      // Trigger stock reduction & order status update
      await this.ordersService.handlePaymentSuccess(payment.orderId);

      // Send notifications
      await this.notificationsService.create({
        patientId: payment.order.patientId,
        orderId: payment.orderId,
        type: 'ORDER_PLACED',
        title: 'Payment Successful',
        message: `Payment of ${payment.amount} RWF completed for order #${payment.order.orderNumber}`,
      });

      await this.notificationsService.create({
        pharmacyId: payment.order.pharmacyId,
        orderId: payment.orderId,
        type: 'ORDER_PLACED',
        title: 'Payment Received',
        message: `Payment received for order #${payment.order.orderNumber}`,
      });

      return { success: true, message: 'Payment verified successfully' };
    } else {
      // Update payment as failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          paymentResponse: verification,
        },
      });

      throw new BadRequestException('Payment verification failed');
    }
  }


  // ========================================
  // PROCESS MTN WEBHOOK (DIRECT)
  // ========================================

  async processMtnPayment(data: MtnCallbackDto) {
    // 1. Find the order based on the externalId sent by MTN
    const order = await this.prisma.order.findUnique({
      where: { id: data.externalId },
      include: { patient: true },
    });

    if (!order) {
      console.error(`Webhook Error: Order ${data.externalId} not found`);
      throw new NotFoundException('Order not found');
    }


    // --- NEW FINANCIAL INTEGRITY CHECK ---
    // We convert everything to numbers to ensure we aren't comparing strings
    const receivedAmount = Number(data.amount);
    const expectedAmount = Number(order.total); 

    if (receivedAmount < expectedAmount) {
      console.error(`SECURITY ALERT: Underpayment detected for Order ${order.id}. Expected ${expectedAmount}, received ${receivedAmount}`);
      
      // Mark payment as failed because the amount is wrong
      await this.prisma.payment.updateMany({
        where: { orderId: order.id },
        data: { status: 'FAILED' },
      });
      
      return { status: 'failed', message: 'Amount mismatch' };
    }

    if (data.currency !== 'RWF') {
       return { status: 'failed', message: 'Invalid currency' };
    }
    // -------------------------------------

    // 2. Logic: What happened with the payment?
    if (data.status === 'SUCCESSFUL') {
      // Update the Payment record
      await this.prisma.payment.updateMany({
        where: { orderId: order.id },
        data: {
          status: 'COMPLETED',
          transactionId: data.financialTransactionId,
        },
      });

      // Update Order status and handle stock (using existing project logic)
      await this.ordersService.handlePaymentSuccess(order.id);

      // Notify the patient
      await this.notificationsService.create({
        patientId: order.patientId,
        orderId: order.id,
        type: 'ORDER_PLACED',
        title: 'Payment Received',
        message: `Your payment of ${data.amount} ${data.currency} was successful!`,
      });

      return { status: 'success', message: 'Order marked as PAID' };
    } else {
      // Handle Failure (FAILED, REJECTED, or TIMEOUT)
      await this.prisma.payment.updateMany({
        where: { orderId: order.id },
        data: { status: 'FAILED' },
      });

      console.warn(`Payment failed for Order ${order.id}. Reason: ${data.reason || 'Unknown'}`);
      return { status: 'failed', message: 'Order marked as FAILED' };
    }
  }




  // ========================================
  // VALIDATE MOBILE MONEY OTP

  async validateOTP(paymentId: string, otp: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            patient: true,
            pharmacy: true,
          },
        },
      },
    });

    if (!payment || !payment.flutterwaveRef) {
      throw new NotFoundException('Payment not found');
    }

    const validation = await this.flutterwaveService.validateMobileMoneyOTP({
      otp,
      flw_ref: payment.flutterwaveRef,
    });

    if (validation.data.status === 'successful') {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          transactionId: validation.data.tx_ref,
        },
      });
      // stock reduction & order status update
      await this.ordersService.handlePaymentSuccess(payment.orderId);

      // Send notifications
      await this.notificationsService.create({
        patientId: payment.order.patientId,
        orderId: payment.orderId,
        type: 'ORDER_PLACED',
        title: 'Payment Successful',
        message: `Payment of ${payment.amount} RWF completed for order #${payment.order.orderNumber}`,
      });

      await this.notificationsService.create({
        pharmacyId: payment.order.pharmacyId,
        orderId: payment.orderId,
        type: 'ORDER_PLACED',
        title: 'Payment Received',
        message: `Payment received for order #${payment.order.orderNumber}`,
      });

      return { success: true, message: 'OTP validated successfully' };
    } else {
      throw new BadRequestException('Invalid OTP');
    }
  }

  // PROCESS REFUND

  async processRefund(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      include: {
        order: true,
      },
    });

    if (!payment || !payment.transactionId) {
      throw new NotFoundException('Payment not found or not completed');
    }

    if (payment.status === 'REFUNDED') {
      throw new BadRequestException('Payment already refunded');
    }

    // Process refund via Flutterwave
    const refund = await this.flutterwaveService.refund(payment.transactionId);

    if (refund.status === 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
        },
      });

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'REFUNDED',
        },
      });

      return { success: true, message: 'Refund processed successfully' };
    } else {
      throw new BadRequestException('Refund failed');
    }
  }

  // CHECKOUT (Create order + initiate payment in one step)

  async checkout(userId: string, dto: CheckoutDto) {
    if (
      (dto.paymentMethod === 'MTN_MOMO' ||
        dto.paymentMethod === 'AIRTEL_MONEY') &&
      !dto.phoneNumber
    ) {
      throw new BadRequestException(
        'Phone number is required for mobile money payments',
      );
    }

    const createOrderDto: CreateOrderDto = {
      pharmacyId: dto.pharmacyId,
      branchId: dto.branchId,
      type: dto.type,
      items: dto.items,
      deliveryAddress: dto.deliveryAddress,
      prescriptionId: dto.prescriptionId,
      paymentMethod: dto.paymentMethod,
      insuranceProvider: dto.insuranceProvider,
      insurancePolicyNumber: dto.insurancePolicyNumber,
    };

    const order = await this.ordersService.create(userId, createOrderDto);

    const initiatePaymentDto: InitiatePaymentDto = {
      orderId: order.id,
      phoneNumber: dto.phoneNumber,
      insuranceProvider: dto.insuranceProvider,
      insurancePolicyNumber: dto.insurancePolicyNumber,
    };

    const paymentResult = await this.initiatePayment(initiatePaymentDto);

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        patientPayment: order.patientPayment,
      },
      payment: paymentResult,
    };
  }
}

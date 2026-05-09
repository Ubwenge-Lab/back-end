// backend/src/payments/payments.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
  RecordPaymentDto,
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

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: order.id },
    });

    if (existingPayment && existingPayment.status === 'COMPLETED') {
      throw new BadRequestException('A completed payment already exists for this order');
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
      case 'CASH':
        // Cash payment is collected in person.
        paymentResponse = {
          status: 'pending',
          message:
            'Cash payment selected. Please pay in person at pickup or delivery.',
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

    if (payment.paymentMethod === 'CASH') {
      throw new BadRequestException(
        'Cash payments are verified manually and cannot be verified through the payment provider',
      );
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

    // --- IDEMPOTENCY CHECK ---
    // If the order is already marked as PAID, return success immediately
    // so we don't trigger handlePaymentSuccess() a second time.
    if (order.paymentStatus === 'COMPLETED') {
      console.log(
        `Webhook received for already completed Order ${order.id}. Skipping processing.`,
      );
      return { status: 'success', message: 'Order already processed' };
    }

    // --- FINANCIAL INTEGRITY CHECK ---
    const receivedAmount = Number(data.amount);
    const expectedAmount = Number(order.total);

    if (receivedAmount < expectedAmount) {
      console.error(
        `SECURITY ALERT: Underpayment detected for Order ${order.id}. Expected ${expectedAmount}, received ${receivedAmount}`,
      );

      await this.prisma.payment.updateMany({
        where: { orderId: order.id },
        data: { status: 'FAILED' },
      });

      return { status: 'failed', message: 'Amount mismatch' };
    }

    if (data.currency !== 'RWF') {
      return { status: 'failed', message: 'Invalid currency' };
    }

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

      // Update Order status and handle stock
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

      console.warn(
        `Payment failed for Order ${order.id}. Reason: ${data.reason || 'Unknown'}`,
      );
      return { status: 'failed', message: 'Order marked as FAILED' };
    }
  }

  // ========================================
  // VALIDATE MOBILE MONEY OTP

  async manualVerifyByOrderId(orderId: string, user: any) {
    // 1. Find the payment associated with this order
    const payment = await this.prisma.payment.findUnique({
      where: { orderId: orderId },
      include: {
        order: {
          include: {
            patient: true,
            pharmacy: true,
          },
        },
      },
    });

    // 2. Make sure the payment exists
    if (!payment) {
      throw new NotFoundException('Payment not found for this order');
    }

    // 3. Prevent verifying a payment that is already complete
    if (payment.status === 'COMPLETED') {
      return { success: true, message: 'Payment is already COMPLETED' };
    }

    // 4. Find the transaction ID.
    const txIdToVerify =
      payment.transactionId || (payment.paymentResponse as any)?.data?.id;

    if (payment.order.paymentMethod === 'CASH') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
        },
      });

      await this.ordersService.handlePaymentSuccess(payment.orderId);
      return {
        success: true,
        message:
          'Cash payment manually confirmed and order updated successfully!',
      };
    }

    if (!txIdToVerify) {
      throw new BadRequestException(
        'No transaction ID found to verify against the Payment Provider',
      );
    }

    try {
      // 5. Ask Flutterwave for the real-world status
      const verification = await this.flutterwaveService.verifyPayment(
        txIdToVerify.toString(),
      );

      if (verification?.data?.status === 'successful') {
        // 6. If Flutterwave says it was successful, update our database!
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'COMPLETED',
            transactionId: txIdToVerify.toString(),
            paymentResponse: verification,
          },
        });

        // 7. Force Database Sync
        await this.ordersService.handlePaymentSuccess(payment.orderId);

        return {
          success: true,
          message: 'Payment manually verified and Order updated successfully!',
        };
      } else {
        return {
          success: false,
          message: `Payment is not successful yet. Current status from provider: ${verification?.data?.status || 'Unknown'}`,
        };
      }
    } catch (error) {
      throw new BadRequestException(
        'Failed to reach payment provider. It may still be processing.',
      );
    }
  }

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

  async getRecentSuccessfulPayments() {
    return this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        order: {
          include: {
            patient: true,
          },
        },
      },
    });
  }


  async getReceipt(paymentId: string, staffUserId: string) {
    // 1. Fetch the payment and include the linked order
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true,
      },
    });

    // Task 3: Return 404 if payment doesn't exist
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // 2. Fetch the staff member's profile to get their branchId
    const staff = await this.prisma.staff.findUnique({
      where: { userId: staffUserId },
    });

    if (!staff) {
      throw new ForbiddenException('Staff record not found');
    }

    // Task 4: Return 403 if the branch doesn't match
    if (payment.order.branchId !== staff.branchId) {
      throw new ForbiddenException(
        'You do not have permission to view receipts for this branch',
      );
    }

    // 3. Return the data (using any to handle the new receiptNumber field)
    return {
      receiptNumber: (payment as any).receiptNumber,
      orderId: payment.orderId,
      totalAmount: payment.order.total,
      paymentStatus: payment.status,
    };
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

  async recordPayment(staffUserId: string, dto: RecordPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        branch: true,
        patient: {
          include: { user: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot record payment for a cancelled order');
    }

    if (order.paymentStatus === 'COMPLETED') {
      throw new BadRequestException('Order has already been paid');
    }

    if (dto.amountReceived < order.patientPayment) {
      throw new BadRequestException(
        'Amount received must be equal to or greater than the patient payment amount',
      );
    }

    if (dto.paymentMethod === 'INSURANCE') {
      if (!dto.insuranceProvider || !dto.insurancePolicyNumber) {
        throw new BadRequestException(
          'Insurance provider and policy number are required for insurance payments',
        );
      }
    }

    if (
      (dto.paymentMethod === 'MTN_MOMO' || dto.paymentMethod === 'AIRTEL_MONEY') &&
      !dto.phoneNumber
    ) {
      throw new BadRequestException(
        'Phone number is required for mobile money payments',
      );
    }

    const branch = await this.resolveBranchForStaff(staffUserId);
    if (!branch || branch.id !== order.branchId) {
      throw new BadRequestException(
        'Order does not belong to the authenticated staff member\'s branch',
      );
    }

    const receiptNumber = await this.generateReceiptNumber(branch.id);

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: order.id },
    });

    if (existingPayment && existingPayment.status === 'COMPLETED') {
      throw new BadRequestException('Order payment has already been completed');
    }


    await this.prisma.$transaction(
      async (tx) => {
        if (existingPayment) {
          if (existingPayment.status === 'COMPLETED') {
            throw new BadRequestException('Order payment has already been completed');
          }

          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              amount: order.patientPayment,
              paymentMethod: dto.paymentMethod,
              status: 'COMPLETED',
              transactionId: dto.reference || existingPayment.transactionId,
              receiptNumber,
              insuranceProvider: dto.insuranceProvider,
              insurancePolicyNumber: dto.insurancePolicyNumber,
              insuranceCoverage: order.insuranceCoverage,
              insuranceVerified: dto.paymentMethod === 'INSURANCE',
              paymentResponse: {
                recordedBy: staffUserId,
                amountReceived: dto.amountReceived,
                paymentMethod: dto.paymentMethod,
                reference: dto.reference || null,
              },
            },
          });
        } else {
          await tx.payment.create({
            data: {
              orderId: order.id,
              amount: order.patientPayment,
              paymentMethod: dto.paymentMethod,
              status: 'COMPLETED',
              transactionId: dto.reference,
              receiptNumber,
              insuranceProvider: dto.insuranceProvider,
              insurancePolicyNumber: dto.insurancePolicyNumber,
              insuranceCoverage: order.insuranceCoverage,
              insuranceVerified: dto.paymentMethod === 'INSURANCE',
              paymentResponse: {
                recordedBy: staffUserId,
                amountReceived: dto.amountReceived,
                paymentMethod: dto.paymentMethod,
                reference: dto.reference || null,
              },
            },
          });
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'COMPLETED',
            paymentMethod: dto.paymentMethod,
          },
        });
      },
      {
        timeout: 20000,
      },
    );

    await this.ordersService.handlePaymentSuccess(order.id);

    return {
      success: true,
      message: 'Payment recorded successfully',
      receiptNumber,
    };
  }

  private async resolveBranchForStaff(userId: string) {
    const branchManager = await this.prisma.branch.findUnique({
      where: { managerId: userId },
    });

    if (branchManager) {
      return branchManager;
    }

    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: { branch: true },
    });

    return staff?.branch ?? null;
  }

  private async generateReceiptNumber(branchId: string) {
    const latestPayment = await this.prisma.payment.findFirst({
      where: {
        order: {
          branchId,
        },
      },
      orderBy: {
        receiptNumber: 'desc',
      },
      select: {
        receiptNumber: true,
      },
    });

    let nextNumber = 1;
    if (latestPayment?.receiptNumber) {
      const match = latestPayment.receiptNumber.match(/RCP-(\d{6})$/);
      if (match) {
        nextNumber = Number(match[1]) + 1;
      }
    }

    return `RCP-${nextNumber.toString().padStart(6, '0')}`;
  }
}

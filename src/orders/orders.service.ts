// backend/src/orders/orders.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { MedicationsService } from '../medications/medications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
import { CreateOrderDto, UpdateOrderStatusDto, CancelOrderDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private patientsService: PatientsService,
    private pharmaciesService: PharmaciesService,
    private medicationsService: MedicationsService,
    private notificationsService: NotificationsService,
    private staffService: StaffService,
  ) {}

  // ========================================
  // CREATE ORDER (Patient places order)
  // ========================================

  async create(userId: string, dto: CreateOrderDto) {
    const patient = await this.patientsService.findByUserId(userId);
    const pharmacy = await this.pharmaciesService.findById(dto.pharmacyId);

    // Validate pharmacy is approved
    if (pharmacy.status !== 'APPROVED') {
      throw new BadRequestException('Pharmacy is not approved');
    }

    // Validate items and calculate subtotal
    const order = await this.prisma.$transaction(
      async (tx) => {
        let subtotal = 0;
        const orderItems: {
          medicationId: string;
          quantity: number;
          price: number;
        }[] = [];

        for (const item of dto.items) {
          // Fetching medication within the transaction to ensure stock is up-to-date
          const medication = await tx.medication.findUnique({
            where: { id: item.medicationId },
          });

          if (!medication) {
            throw new NotFoundException(
              `Medication ${item.medicationId} not found`,
            );
          }

          // Check stock
          if (medication.quantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for ${medication.name}. Available: ${medication.quantity}`,
            );
          }

          // Check pharmacy match
          if (medication.pharmacyId !== dto.pharmacyId) {
            throw new BadRequestException(
              `Medication ${medication.name} does not belong to this pharmacy`,
            );
          }

          // Check prescription requirement
          if (medication.requiresPrescription && !dto.prescriptionId) {
            throw new BadRequestException(
              `Prescription required for ${medication.name}`,
            );
          }

          subtotal += medication.price * item.quantity;
          orderItems.push({
            medicationId: medication.id,
            quantity: item.quantity,
            price: medication.price,
          });
          // FIX: Use atomic update with condition to prevent race conditions
          // This prevents overselling by ensuring quantity doesn't go negative
          const updateResult = await tx.medication.updateMany({
            where: {
              id: item.medicationId,
              quantity: { gte: item.quantity }, // Only update if sufficient stock
            },
            data: {
              quantity: { decrement: item.quantity },
            },
          });

          // If no rows were updated, stock was insufficient (race condition occurred)
          if (updateResult.count === 0) {
            throw new BadRequestException(
              `Insufficient stock for ${medication.name}. Stock may have been depleted by another order.`,
            );
          }
        }

        // Calculate delivery fee if applicable
        let deliveryFee = 0;
        let deliveryZone: string | null = null;

        if (dto.type === 'DELIVERY') {
          if (!dto.deliveryAddress) {
            throw new BadRequestException(
              'Delivery address is required for delivery orders',
            );
          }

          // For MVP, use fixed delivery zones
          // In production, calculate based on actual coordinates
          deliveryFee = 2000; // Fixed delivery fee for MVP
          deliveryZone = 'Zone 1';
        }

        // Calculate total
        const total = subtotal + deliveryFee;

        // Handle insurance if applicable
        let insuranceCoverage = 0;
        let patientPayment = total;

        if (dto.paymentMethod === 'INSURANCE') {
          if (!patient.insuranceProvider || !patient.insuranceCoverage) {
            throw new BadRequestException(
              'Patient does not have valid insurance',
            );
          }

          insuranceCoverage = (subtotal * patient.insuranceCoverage) / 100;
          patientPayment = subtotal - insuranceCoverage + deliveryFee;
        }

        // Generate unique order number
        const orderNumber = await this.generateOrderNumber(tx);

        // Create order
        const createdOrder = await tx.order.create({
          data: {
            patientId: patient.id,
            pharmacyId: dto.pharmacyId,
            branchId: dto.branchId,
            orderNumber,
            type: dto.type,
            status: 'PENDING',
            deliveryAddress: dto.deliveryAddress,
            deliveryFee,
            deliveryZone,
            prescriptionId: dto.prescriptionId,
            subtotal,
            total,
            paymentMethod: dto.paymentMethod,
            paymentStatus: 'PENDING',
            insuranceCoverage,
            patientPayment,
            orderItems: {
              create: orderItems,
            },
          },
          include: {
            orderItems: {
              include: {
                medication: true,
              },
            },
            pharmacy: true,
            prescription: true,
          },
        });
        return createdOrder;
      },
      {
        timeout: 20000, // Increased for remote Supabase latency
      },
    );

    // FIX: Send notifications AFTER transaction commits to avoid foreign key issues
    // This ensures the order exists in the database before creating notifications
    try {
      // Send notification to pharmacy
      await this.notificationsService.create({
        pharmacyId: pharmacy.id,
        orderId: order.id,
        type: 'ORDER_PLACED',
        title: 'New Order Received',
        message: `New order #${order.orderNumber} from ${patient.firstName} ${patient.lastName}`,
      });

      // Send notification to patient
      await this.notificationsService.create({
        patientId: patient.id,
        orderId: order.id,
        type: 'ORDER_PLACED',
        title: 'Order Placed Successfully',
        message: `Your order #${order.orderNumber} has been placed and is awaiting pharmacy confirmation.`,
      });
    } catch (notificationError) {
      // Log error but don't fail the order creation
      console.error('Failed to send notifications:', notificationError);
    }

    return order;
  }

  // ========================================
  // GET ORDER BY ID
  // ========================================

  async findById(id: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
        pharmacy: true,
        prescription: true,
        orderItems: {
          include: {
            medication: true,
          },
        },
        payment: true,
      },
    });

    // FIX: Added null check for order
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Verify identity
    if (userId) {
      const patient = await this.patientsService
        .findByUserId(userId)
        .catch(() => null);
      const pharmacy = await this.pharmaciesService
        .findByUserId(userId)
        .catch(() => null);
      const staff = await this.staffService
        .findByUserId(userId)
        .catch(() => null);
      const branchManager = await this.prisma.branch.findFirst({
        where: { managerId: userId },
      });

      const isOwner =
        (patient && order.patientId === patient.id) ||
        (pharmacy && order.pharmacyId === pharmacy.id) ||
        (staff && staff.branch.id === order.branchId) ||
        (branchManager && branchManager.id === order.branchId);

      if (!isOwner) {
        throw new ForbiddenException(
          'You are not authorized to access this order',
        );
      }
    }

    return order;
  }

  // ========================================
  // GET PATIENT ORDERS
  // ========================================

  async findByPatient(userId: string, status?: string) {
    const patient = await this.patientsService.findByUserId(userId);

    const where: any = { patientId: patient.id };
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        pharmacy: {
          select: { name: true, phone: true, address: true },
        },
        orderItems: {
          include: {
            medication: {
              select: { name: true, imageUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // GET PHARMACY ORDERS
  // ========================================

  async findByPharmacy(userId: string, status?: string) {
    let pharmacyId: string;
    let branchId: string | undefined;

    try {
      const pharmacy = await this.pharmaciesService.findByUserId(userId);
      pharmacyId = pharmacy.id;
    } catch (e) {
      // Check if Branch Manager
      const branchManager = await this.prisma.branch.findFirst({
        where: { managerId: userId },
      });
      if (branchManager) {
        pharmacyId = branchManager.pharmacyId;
        branchId = branchManager.id;
      } else {
        // Try finding as Staff
        const staff = await this.staffService.findByUserId(userId);
        pharmacyId = staff.branch.pharmacyId;
        branchId = staff.branch.id;
      }
    }

    const where: any = { pharmacyId };
    if (branchId) {
      where.branchId = branchId;
    }
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        patient: {
          select: { firstName: true, lastName: true, phone: true },
        },
        orderItems: {
          include: {
            medication: {
              select: { name: true },
            },
          },
        },
        prescription: {
          select: { id: true, fileUrl: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // UPDATE ORDER STATUS (Pharmacy)
  // ========================================

  async updateStatus(id: string, userId: string, dto: UpdateOrderStatusDto) {
    const order = await this.findById(id);

    let isAuthorized = false;

    // Check if Pharmacy Owner
    try {
      const pharmacy = await this.pharmaciesService.findByUserId(userId);
      if (order.pharmacyId === pharmacy.id) isAuthorized = true;
    } catch (e) {
      // Check if Branch Manager
      const branchManager = await this.prisma.branch.findFirst({
        where: { managerId: userId },
      });
      if (branchManager && branchManager.id === order.branchId) {
        isAuthorized = true;
      } else {
        // Check if Staff
        try {
          const staff = await this.staffService.findByUserId(userId);
          if (staff.branch.id === order.branchId) isAuthorized = true;
        } catch (err) {
          // Not staff either
        }
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You can only update your own orders');
    }

    // Validate status transition
    this.validateStatusTransition(order.status as any, dto.status as any);

    // Update order
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status as any,
        cancellationReason: dto.cancellationReason,
        cancelledAt: dto.status === 'CANCELLED' ? new Date() : undefined,
      },
      include: {
        patient: true,
        pharmacy: true,
        orderItems: {
          include: {
            medication: true,
          },
        },
      },
    });

    // Send notifications based on status
    await this.sendStatusNotification(updated);

    return updated;
  }

  // ========================================
  // CANCEL ORDER (Patient)
  // ========================================

  async cancel(id: string, userId: string, dto: CancelOrderDto) {
    const order = await this.findById(id);
    const patient = await this.patientsService.findByUserId(userId);

    // Verify patient owns this order
    if (order.patientId !== patient.id) {
      throw new ForbiddenException('You can only cancel your own orders');
    }

    // Check if cancellation is allowed (only until PREPARING)
    if (
      [
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'READY_FOR_PICKUP',
        'DELIVERED',
        'COMPLETED',
      ].includes(order.status)
    ) {
      throw new BadRequestException(
        'Cannot cancel order at this stage. Please contact the pharmacy.',
      );
    }

    // Cancel order
    const cancelled = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: dto.cancellationReason,
        cancelledAt: new Date(),
      },
    });

    // Restore stock since it was reserved during order creation
    for (const item of order.orderItems) {
      await this.medicationsService.restoreStock(
        item.medicationId,
        item.quantity,
      );
    }

    // Notify pharmacy
    await this.notificationsService.create({
      pharmacyId: order.pharmacyId,
      orderId: order.id,
      type: 'ORDER_CANCELLED',
      title: 'Order Cancelled',
      message: `Order #${order.orderNumber} has been cancelled by the patient.`,
    });

    return cancelled;
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  // FIX: Accept transaction parameter to use within transaction
  private async generateOrderNumber(tx?: any): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const prismaClient = tx || this.prisma;

    const count = await prismaClient.order.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
        },
      },
    });

    const orderNum = String(count + 1).padStart(4, '0');
    return `ORD-${year}${month}${day}-${orderNum}`;
  }

  private validateStatusTransition(currentStatus: string, newStatus: string) {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'READY_FOR_PICKUP'],
      READY: ['OUT_FOR_DELIVERY'],
      OUT_FOR_DELIVERY: ['DELIVERED'],
      READY_FOR_PICKUP: ['COMPLETED'],
      DELIVERED: ['COMPLETED'],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  private async sendStatusNotification(order: any) {
    const notificationMap: Record<
      string,
      { title: string; message: string; type: any }
    > = {
      ACCEPTED: {
        title: 'Order Accepted',
        message: `Your order #${order.orderNumber} has been accepted by ${order.pharmacy.name}`,
        type: 'ORDER_ACCEPTED',
      },
      PREPARING: {
        title: 'Order Being Prepared',
        message: `Your order #${order.orderNumber} is being prepared`,
        type: 'ORDER_PREPARING',
      },
      OUT_FOR_DELIVERY: {
        title: 'Order Out for Delivery',
        message: `Your order #${order.orderNumber} is on its way!`,
        type: 'ORDER_OUT_FOR_DELIVERY',
      },
      READY_FOR_PICKUP: {
        title: 'Order Ready for Pickup',
        message: `Your order #${order.orderNumber} is ready for pickup at ${order.pharmacy.name}`,
        type: 'ORDER_READY_FOR_PICKUP',
      },
      DELIVERED: {
        title: 'Order Delivered',
        message: `Your order #${order.orderNumber} has been delivered`,
        type: 'ORDER_DELIVERED',
      },
      CANCELLED: {
        title: 'Order Cancelled',
        message: `Order #${order.orderNumber} has been cancelled`,
        type: 'ORDER_CANCELLED',
      },
    };

    const notification = notificationMap[order.status];
    if (notification) {
      // In-app notification
      await this.notificationsService.create({
        patientId: order.patientId,
        orderId: order.id,
        ...notification,
      });

      // Email notification — send to patient if patient email is available
      try {
        const patientUser = order.patient?.user;
        const patientName = order.patient
          ? `${order.patient.firstName} ${order.patient.lastName}`
          : 'Customer';
        const emailTarget = patientUser?.email ?? order.patient?.email;

        if (emailTarget) {
          await this.notificationsService.sendOrderStatusEmail({
            email: emailTarget,
            name: patientName,
            orderNumber: order.orderNumber,
            status: order.status,
            message: notification.message,
          });
        }
      } catch (emailErr) {
        // Never block the main flow due to email failure
        console.error(
          '❌ Failed to send order status email:',
          emailErr?.message,
        );
      }
    }
  }

  async confirmDelivery(orderId: string, userId: string) {
    const order = await this.findById(orderId);
    const patient = await this.patientsService.findByUserId(userId);

    if (order.patientId !== patient.id) {
      throw new ForbiddenException();
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      throw new BadRequestException('Invalid state');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED' },
    });

    await this.sendStatusNotification(updated);

    return updated;
  }

  async handlePaymentSuccess(orderId: string) {
    return await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { orderItems: true },
        });

        if (!order) throw new NotFoundException('Order not found');

        // Prevent double processing
        if (order.paymentStatus === 'COMPLETED') {
          return order; // Already processed
        }

        // Stock was already reserved during order creation (Line 85).
        // No need to reduce it again here.

        // Update order status to PENDING (ready for pharmacy to prepare)
        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'PENDING',
            paymentStatus: 'COMPLETED',
          },
        });

        return updated;
      },
      {
        timeout: 20000, // Increased for remote Supabase latency
      },
    );
  }
}

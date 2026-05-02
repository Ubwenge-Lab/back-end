import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createTestOrders() {
  try {
    console.log('🛒 Creating 4 test orders...\n');

    // First, get existing users and pharmacy
    const pharmacy = await prisma.pharmacy.findFirst();
    const branch = await prisma.branch.findFirst();
    const patient = await prisma.patient.findFirst();
    const medications = await prisma.medication.findMany({ take: 4 });

    if (!pharmacy || !branch || !patient || medications.length < 4) {
      console.log('❌ Missing required data. Please run the full seed first.');
      return;
    }

// Create 4 test orders
const orders = [
  {
    patientId: patient.id,
    pharmacyId: pharmacy.id,
    branchId: branch.id,
    orderNumber: randomUUID(),
    type: 'PICKUP',
    status: 'PENDING',
    subtotal: 5000,
    total: 5000,
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    patientPayment: 5000,
    orderItems: {
      create: [
        {
          medicationId: medications[0].id,
          quantity: 2,
          price: 2500,
        },
      ],
    },
  },
  {
    patientId: patient.id,
    pharmacyId: pharmacy.id,
    branchId: branch.id,
    orderNumber: randomUUID(),
    type: 'DELIVERY',
    status: 'ACCEPTED',
    deliveryAddress: 'Test Address, Kigali',
    deliveryFee: 1000,
    subtotal: 7500,
    total: 8500,
    paymentMethod: 'CARD',
    paymentStatus: 'PENDING',
    patientPayment: 8500,
    orderItems: {
      create: [
        {
          medicationId: medications[1].id,
          quantity: 3,
          price: 2500,
        },
      ],
    },
  },
  {
    patientId: patient.id,
    pharmacyId: pharmacy.id,
    branchId: branch.id,
    orderNumber: randomUUID(),
    type: 'PICKUP',
    status: 'PREPARING',
    subtotal: 12000,
    total: 12000,
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    patientPayment: 12000,
    orderItems: {
      create: [
        {
          medicationId: medications[2].id,
          quantity: 4,
          price: 3000,
        },
      ],
    },
  },
  {
    patientId: patient.id,
    pharmacyId: pharmacy.id,
    branchId: branch.id,
    orderNumber: randomUUID(),
        type: 'DELIVERY',
        status: 'READY_FOR_PICKUP',
        deliveryAddress: 'Another Test Address, Kigali',
        deliveryFee: 1500,
        subtotal: 15000,
        total: 16500,
        paymentMethod: 'CARD',
        paymentStatus: 'PENDING',
        patientPayment: 16500,
        orderItems: {
          create: [
            {
              medicationId: medications[3].id,
              quantity: 5,
              price: 3000,
            },
          ],
        },
      },
    ];

    for (const orderData of orders) {
      const order = await prisma.order.create({
        data: orderData,
      });
      console.log(`✅ Created order: ${order.orderNumber} (ID: ${order.id})`);
    }

    console.log('\n🎉 All 4 test orders created successfully!');
    console.log('\n📋 Order Details:');
    console.log('TEST-001: 5,000 RWF (PENDING, CASH) - Pickup');
    console.log('TEST-002: 8,500 RWF (ACCEPTED, CARD) - Delivery');
    console.log('TEST-003: 12,000 RWF (PREPARING, CASH) - Pickup');
    console.log('TEST-004: 16,500 RWF (READY_FOR_PICKUP, CARD) - Delivery');

  } catch (error) {
    console.error('❌ Error creating test orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestOrders();
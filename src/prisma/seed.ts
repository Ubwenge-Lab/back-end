// backend/src/prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient() as any;

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Test@1234';

async function clearDatabase() {
  console.log('🧹 Clearing existing data...');
  // Delete in dependency order (leaf tables first)
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.prescriptionMedication.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.stockTransferItem.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.staffPermissions.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.pharmacy.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Database cleared.\n');
}

async function main() {
  console.log('🌱 Starting seed update...\n');

  // await clearDatabase(); // Removed to avoid wiping existing data

  const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  // ==========================================
  // 1. USERS
  // ==========================================
  console.log('👤 Creating users...');

  const superAdminUser = await prisma.user.upsert({
    where: { email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@pharma.com' },
    update: {},
    create: {
      email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@pharma.com',
      password: await bcrypt.hash(
        process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminPower@2025',
        HASH_ROUNDS,
      ),
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });

  const pharmacyUser = await prisma.user.upsert({
    where: { email: 'owner@medplus.com' },
    update: {},
    create: {
      email: 'owner@medplus.com',
      password,
      role: 'PHARMACY',
      isVerified: true,
    },
  });

  const branchManagerUser = await prisma.user.upsert({
    where: { email: 'manager@medplus.com' },
    update: {},
    create: {
      email: 'manager@medplus.com',
      password,
      role: 'BRANCH_MANAGER',
      isVerified: true,
    },
  });

  const pharmacistUser = await prisma.user.upsert({
    where: { email: 'pharmacist@medplus.com' },
    update: {},
    create: {
      email: 'pharmacist@medplus.com',
      password,
      role: 'PHARMACIST',
      isVerified: true,
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { email: 'cashier@medplus.com' },
    update: {},
    create: {
      email: 'cashier@medplus.com',
      password,
      role: 'CASHIER',
      isVerified: true,
    },
  });

  const patient1User = await prisma.user.upsert({
    where: { email: 'alice@patient.com' },
    update: {},
    create: {
      email: 'alice@patient.com',
      password,
      role: 'PATIENT',
      isVerified: true,
    },
  });

  const patient2User = await prisma.user.upsert({
    where: { email: 'bob@patient.com' },
    update: {},
    create: {
      email: 'bob@patient.com',
      password,
      role: 'PATIENT',
      isVerified: true,
    },
  });

  console.log('✅ Users created.\n');

  // ==========================================
  // 2. PHARMACY
  // ==========================================
  console.log('🏥 Creating pharmacy...');

  const pharmacy = await prisma.pharmacy.upsert({
    where: { userId: pharmacyUser.id },
    update: {
      latitude: -1.9441,
      longitude: 30.0619,
    },
    create: {
      userId: pharmacyUser.id,
      name: 'MedPlus Pharmacy',
      representativeName: 'Dr. John Doe',
      phone: '+250788000001',
      address: 'KN 5 Ave, Kigali, Rwanda',
      latitude: -1.9441,
      longitude: 30.0619,
      dateOfIncorporation: new Date('2018-03-15'),
      rdbCertificate: 'RDB-2018-001234',
      pharmacyLicense: 'LIC-2018-PH-001',
      businessRegistration: 'BRN-2018-567890',
      deliveryZones: ['Kigali', 'Gasabo', 'Kicukiro', 'Nyarugenge'],
      operatingHours: {
        monday: { open: '08:00', close: '20:00' },
        tuesday: { open: '08:00', close: '20:00' },
        wednesday: { open: '08:00', close: '20:00' },
        thursday: { open: '08:00', close: '20:00' },
        friday: { open: '08:00', close: '20:00' },
        saturday: { open: '09:00', close: '18:00' },
        sunday: { open: '10:00', close: '16:00' },
      },
      status: 'APPROVED',
      approvedAt: new Date('2018-04-01'),
    },
  });

  console.log('✅ Pharmacy created.\n');

  // ==========================================
  // 3. BRANCH (with manager linked)
  // ==========================================
  console.log('🏪 Creating branches...');

  const mainBranch = await prisma.branch.upsert({
    where: { managerId: branchManagerUser.id },
    update: {
      latitude: -1.9441,
      longitude: 30.0619,
    },
    create: {
      pharmacyId: pharmacy.id,
      managerId: branchManagerUser.id,
      name: 'MedPlus Main Branch',
      address: 'KN 5 Ave, Kigali, Rwanda',
      phone: '+250788000010',
      latitude: -1.9441,
      longitude: 30.0619,
      isActive: true,
      branchStatus: 'APPROVED',
      branchManagerEmail: 'manager@medplus.com',
      operatingHours: {
        monday: { open: '08:00', close: '20:00' },
        tuesday: { open: '08:00', close: '20:00' },
        wednesday: { open: '08:00', close: '20:00' },
        thursday: { open: '08:00', close: '20:00' },
        friday: { open: '08:00', close: '20:00' },
        saturday: { open: '09:00', close: '18:00' },
        sunday: { open: '10:00', close: '16:00' },
      },
    },
  });

  const secondBranch = await prisma.branch.upsert({
    where: { id: '9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c' }, // Fixed ID for idempotent seeding
    update: {
      latitude: -1.9559,
      longitude: 30.1125,
    },
    create: {
      id: '9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c',
      pharmacyId: pharmacy.id,
      name: 'MedPlus Remera Branch',
      address: 'Remera, Kigali, Rwanda',
      phone: '+250788000020',
      latitude: -1.9559,
      longitude: 30.1125,
      isActive: true,
      branchStatus: 'APPROVED',
      branchManagerEmail: 'remera.manager@medplus.com',
      operatingHours: {
        monday: { open: '08:00', close: '19:00' },
        tuesday: { open: '08:00', close: '19:00' },
        wednesday: { open: '08:00', close: '19:00' },
        thursday: { open: '08:00', close: '19:00' },
        friday: { open: '08:00', close: '19:00' },
        saturday: { open: '09:00', close: '17:00' },
      },
    },
  });

  console.log('✅ Branches created.\n');

  // ==========================================
  // 4. STAFF (Pharmacist + Cashier)
  // ==========================================
  console.log('👨‍⚕️ Creating staff...');

  const pharmacistStaff = await prisma.staff.upsert({
    where: { userId: pharmacistUser.id },
    update: {},
    create: {
      userId: pharmacistUser.id,
      branchId: mainBranch.id,
      firstName: 'Samuel',
      lastName: 'Nkurunziza',
      phone: '+250788100001',
      nationalId: '1199080012345678',
      gender: 'Male',
      dateOfBirth: new Date('1990-05-14'),
      status: 'ACTIVE',
      workingHours: {
        monday: { start: '08:00', end: '17:00' },
        tuesday: { start: '08:00', end: '17:00' },
        wednesday: { start: '08:00', end: '17:00' },
        thursday: { start: '08:00', end: '17:00' },
        friday: { start: '08:00', end: '17:00' },
      },
      permissions: {
        create: {
          permissions: [
            'VIEW_ORDERS',
            'ACCEPT_ORDERS',
            'UPDATE_ORDER_STATUS',
            'VIEW_INVENTORY',
            'ADD_MEDICATION',
            'EDIT_MEDICATION',
            'VIEW_PRESCRIPTIONS',
            'APPROVE_PRESCRIPTIONS',
            'REJECT_PRESCRIPTIONS',
            'VIEW_CUSTOMERS',
            'VIEW_ANALYTICS',
          ],
        },
      },
    },
  });

  const cashierStaff = await prisma.staff.upsert({
    where: { userId: cashierUser.id },
    update: {},
    create: {
      userId: cashierUser.id,
      branchId: mainBranch.id,
      firstName: 'Grace',
      lastName: 'Uwimana',
      phone: '+250788100002',
      nationalId: '1199580098765432',
      gender: 'Female',
      dateOfBirth: new Date('1995-08-22'),
      status: 'ACTIVE',
      workingHours: {
        monday: { start: '09:00', end: '18:00' },
        tuesday: { start: '09:00', end: '18:00' },
        wednesday: { start: '09:00', end: '18:00' },
        thursday: { start: '09:00', end: '18:00' },
        friday: { start: '09:00', end: '18:00' },
      },
      permissions: {
        create: {
          permissions: [
            'VIEW_ORDERS',
            'VIEW_INVENTORY',
            'VIEW_PAYMENTS',
            'PROCESS_PAYMENTS',
            'VIEW_CUSTOMERS',
          ],
        },
      },
    },
  });

  console.log('✅ Staff created.\n');

  // ==========================================
  // 5. PATIENTS
  // ==========================================
  console.log('🧑‍🤝‍🧑 Creating patients...');

  const patient1 = await prisma.patient.upsert({
    where: { userId: patient1User.id },
    update: {
      lastLat: -1.9380,
      lastLng: 30.1050,
    },
    create: {
      userId: patient1User.id,
      firstName: 'Alice',
      lastName: 'Mukamana',
      phone: '+250788200001',
      dateOfBirth: new Date('1992-03-10'),
      gender: 'Female',
      address: 'Gasabo District, Kigali, Rwanda',
      nationalId: '1199280000111222',
      insuranceProvider: 'RSSB',
      insurancePolicy: 'RSSB-2024-001',
      insuranceMemberId: 'MBR-001122',
      insuranceCoverage: 80,
      lastLat: -1.9380,
      lastLng: 30.1050,
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { userId: patient2User.id },
    update: {
      lastLat: -1.9523,
      lastLng: 30.0601,
    },
    create: {
      userId: patient2User.id,
      firstName: 'Bob',
      lastName: 'Habimana',
      phone: '+250788200002',
      dateOfBirth: new Date('1988-11-25'),
      gender: 'Male',
      address: 'Nyarugenge District, Kigali, Rwanda',
      nationalId: '1198880000333444',
      lastLat: -1.9523,
      lastLng: 30.0601,
    },
  });

  console.log('✅ Patients created.\n');

  // ==========================================
  // 6. MEDICATIONS
  // ==========================================
  console.log('💊 Creating medications...');

  const medicationsData = [
    {
      id: '593b4f65-276e-4734-9721-a5d2f6f69911',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Amoxicillin 500mg Capsules',
      chemicalName: 'Amoxicillin trihydrate',
      description: 'Broad-spectrum antibiotic used to treat bacterial infections.',
      category: 'Antibiotics',
      price: 2500,
      quantity: 200,
      lowStockThreshold: 20,
      requiresPrescription: true,
    },
    {
      id: 'e77e3871-38d7-4d6b-8c8e-8a7e3d2b1a11',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Paracetamol 500mg Tablets',
      chemicalName: 'Paracetamol (Acetaminophen)',
      description: 'Common pain reliever and fever reducer.',
      category: 'Analgesics',
      price: 500,
      quantity: 500,
      lowStockThreshold: 50,
      requiresPrescription: false,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c61',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Metformin 850mg Tablets',
      chemicalName: 'Metformin hydrochloride',
      description: 'First-line medication for type 2 diabetes management.',
      category: 'Antidiabetics',
      price: 3500,
      quantity: 150,
      lowStockThreshold: 15,
      requiresPrescription: true,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c62',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Ibuprofen 400mg Tablets',
      chemicalName: 'Ibuprofen',
      description: 'Non-steroidal anti-inflammatory drug for pain, fever and inflammation.',
      category: 'NSAIDs',
      price: 800,
      quantity: 300,
      lowStockThreshold: 30,
      requiresPrescription: false,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c63',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Atorvastatin 20mg Tablets',
      chemicalName: 'Atorvastatin calcium',
      description: 'Statin medication to lower cholesterol levels.',
      category: 'Cardiovascular',
      price: 4500,
      quantity: 100,
      lowStockThreshold: 10,
      requiresPrescription: true,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c64',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'ORS Sachets (Oral Rehydration Salts)',
      chemicalName: 'Sodium chloride / Potassium chloride / Glucose',
      description: 'Used to prevent and treat dehydration due to diarrhea or vomiting.',
      category: 'Electrolytes',
      price: 300,
      quantity: 600,
      lowStockThreshold: 60,
      requiresPrescription: false,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c65',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Omeprazole 20mg Capsules',
      chemicalName: 'Omeprazole magnesium',
      description: 'Proton pump inhibitor used to treat gastroesophageal reflux disease (GERD) and stomach ulcers.',
      category: 'Gastrointestinal',
      price: 1800,
      quantity: 8,
      lowStockThreshold: 10,
      requiresPrescription: false,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c66',
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      name: 'Amlodipine 5mg Tablets',
      chemicalName: 'Amlodipine besylate',
      description: 'Calcium channel blocker used to treat high blood pressure and chest pain.',
      category: 'Cardiovascular',
      price: 2000,
      quantity: 120,
      lowStockThreshold: 10,
      requiresPrescription: true,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c67',
      pharmacyId: pharmacy.id,
      branchId: secondBranch.id,
      name: 'Amoxicillin 500mg Capsules',
      chemicalName: 'Amoxicillin trihydrate',
      description: 'Broad-spectrum antibiotic used to treat bacterial infections.',
      category: 'Antibiotics',
      price: 2500,
      quantity: 50,
      lowStockThreshold: 20,
      requiresPrescription: true,
    },
    {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c68',
      pharmacyId: pharmacy.id,
      branchId: secondBranch.id,
      name: 'Paracetamol 500mg Tablets',
      chemicalName: 'Paracetamol (Acetaminophen)',
      description: 'Common pain reliever and fever reducer.',
      category: 'Analgesics',
      price: 500,
      quantity: 200,
      lowStockThreshold: 50,
      requiresPrescription: false,
    },
  ];

  const medications = await Promise.all(
    medicationsData.map(data =>
      prisma.medication.upsert({
        where: { id: data.id },
        update: {
          price: data.price,
          quantity: data.quantity,
        },
        create: data,
      })
    )
  );

  const [
    amoxicillin,
    paracetamol,
    metformin,
    ibuprofen,
    atorvastatin,
    ors,
    omeprazole,
    amlodipine,
  ] = medications;

  console.log('✅ Medications created.\n');

  // ==========================================
  // 7. PRESCRIPTIONS
  // ==========================================
  console.log('📋 Creating prescriptions...');

  const approvedPrescription = await prisma.prescription.upsert({
    where: { id: 'd1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a' },
    update: {},
    create: {
      id: 'd1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a',
      patientId: patient1.id,
      fileUrl: 'https://storage.example.com/prescriptions/rx-alice-001.pdf',
      fileName: 'prescription_alice_001.pdf',
      fileType: 'application/pdf',
      status: 'APPROVED',
      reviewedAt: new Date('2026-03-10T10:00:00Z'),
      aiProcessingStatus: 'COMPLETED',
      extractedMedications: [
        { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Three times daily', duration: '7 days' },
        { name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'Twice daily', duration: '5 days' },
      ],
      prescriptionMedications: {
        create: [
          {
            medicationName: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'Three times daily',
            duration: '7 days',
            quantity: 21,
            matchedMedicationId: amoxicillin.id,
            available: true,
          },
          {
            medicationName: 'Paracetamol 500mg',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '5 days',
            quantity: 10,
            matchedMedicationId: paracetamol.id,
            available: true,
          },
        ],
      },
    },
  });

  await prisma.prescription.upsert({
    where: { id: 'e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b' },
    update: {},
    create: {
      id: 'e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
      patientId: patient2.id,
      fileUrl: 'https://storage.example.com/prescriptions/rx-bob-001.pdf',
      fileName: 'prescription_bob_001.pdf',
      fileType: 'application/pdf',
      status: 'PENDING',
      aiProcessingStatus: 'COMPLETED',
      extractedMedications: [
        { name: 'Metformin 850mg', dosage: '850mg', frequency: 'Twice daily', duration: '30 days' },
      ],
      prescriptionMedications: {
        create: [
          {
            medicationName: 'Metformin 850mg',
            dosage: '850mg',
            frequency: 'Twice daily',
            duration: '30 days',
            quantity: 60,
            matchedMedicationId: metformin.id,
            available: true,
          },
        ],
      },
    },
  });

  console.log('✅ Prescriptions created.\n');

  // ==========================================
  // 8. ORDERS
  // ==========================================
  console.log('🛒 Creating orders...');

  // Order 1: COMPLETED delivery order for Alice, paid via MTN MOMO
  const completedOrder = await prisma.order.upsert({
    where: { orderNumber: 'ORD-2026-0001' },
    update: {},
    create: {
      patientId: patient1.id,
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      orderNumber: 'ORD-2026-0001',
      type: 'DELIVERY',
      status: 'COMPLETED',
      deliveryAddress: 'Gasabo District, Kigali, Rwanda',
      deliveryFee: 1000,
      deliveryZone: 'Gasabo',
      prescriptionId: approvedPrescription.id,
      subtotal: 57500, // 21*2500 + 10*500
      total: 58500,
      paymentMethod: 'MTN_MOMO',
      paymentStatus: 'COMPLETED',
      insuranceCoverage: 46800, // 80% of subtotal from RSSB
      patientPayment: 11700,
      orderItems: {
        create: [
          {
            medicationId: amoxicillin.id,
            quantity: 21,
            price: 2500,
          },
          {
            medicationId: paracetamol.id,
            quantity: 10,
            price: 500,
          },
        ],
      },
    },
  });

  await prisma.payment.upsert({
    where: { orderId: completedOrder.id },
    update: {},
    create: {
      orderId: completedOrder.id,
      amount: 11700,
      paymentMethod: 'MTN_MOMO',
      status: 'COMPLETED',
      transactionId: 'TXN-MTN-20260310-001',
      flutterwaveRef: 'FLW-MOCK-001122',
      insuranceProvider: 'RSSB',
      insurancePolicyNumber: 'RSSB-2024-001',
      insuranceCoverage: 46800,
      insuranceVerified: true,
      paymentResponse: {
        status: 'success',
        message: 'Payment processed successfully',
        data: { reference: 'FLW-MOCK-001122', amount: 11700, currency: 'RWF' },
      },
    },
  });

  // Order 2: PENDING pickup order for Bob
  const pendingOrder = await prisma.order.upsert({
    where: { orderNumber: 'ORD-2026-0002' },
    update: {},
    create: {
      patientId: patient2.id,
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      orderNumber: 'ORD-2026-0002',
      type: 'PICKUP',
      status: 'PENDING',
      subtotal: 5600, // 4*ibuprofen(800) + 6*ors(300)
      total: 5600,
      paymentMethod: 'CARD',
      paymentStatus: 'PENDING',
      patientPayment: 5600,
      orderItems: {
        create: [
          {
            medicationId: ibuprofen.id,
            quantity: 4,
            price: 800,
          },
          {
            medicationId: ors.id,
            quantity: 6,
            price: 300,
          },
        ],
      },
    },
  });

  // Order 3: ACCEPTED order for Alice
  const acceptedOrder = await prisma.order.upsert({
    where: { orderNumber: 'ORD-2026-0003' },
    update: {},
    create: {
      patientId: patient1.id,
      pharmacyId: pharmacy.id,
      branchId: mainBranch.id,
      orderNumber: 'ORD-2026-0003',
      type: 'PICKUP',
      status: 'ACCEPTED',
      subtotal: 11000,
      total: 11000,
      paymentMethod: 'CARD',
      paymentStatus: 'PENDING',
      patientPayment: 11000,
      orderItems: {
        create: [
          {
            medicationId: atorvastatin.id,
            quantity: 2,
            price: 4500,
          },
          {
            medicationId: amlodipine.id,
            quantity: 1,
            price: 2000,
          },
        ],
      },
    },
  });

  console.log('✅ Orders created.\n');

  // ==========================================
  // 9. CART ITEMS (for patient2)
  // ==========================================
  console.log('🛍️ Creating cart items...');

  await prisma.cartItem.createMany({
    data: [
      {
        patientId: patient2.id,
        pharmacyId: pharmacy.id,
        medicationId: omeprazole.id,
        quantity: 2,
      },
      {
        patientId: patient2.id,
        pharmacyId: pharmacy.id,
        medicationId: paracetamol.id,
        quantity: 1,
      },
    ],
  });

  console.log('✅ Cart items created.\n');

  // ==========================================
  // 10. STOCK TRANSFER (main → remera branch)
  // ==========================================
  console.log('🔄 Creating stock transfer...');

  await prisma.stockTransfer.upsert({
    where: { id: 't1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c64' },
    update: {},
    create: {
      id: 't1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c64',
      fromBranchId: mainBranch.id,
      toBranchId: secondBranch.id,
      status: 'COMPLETED',
      notes: 'Replenishing stock at Remera branch due to high demand.',
      items: {
        create: [
          {
            medicationId: amoxicillin.id,
            quantity: 30,
          },
          {
            medicationId: paracetamol.id,
            quantity: 100,
          },
        ],
      },
    },
  });

  await prisma.stockTransfer.upsert({
    where: { id: 't2b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c65' },
    update: {},
    create: {
      id: 't2b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c65',
      fromBranchId: mainBranch.id,
      toBranchId: secondBranch.id,
      status: 'PENDING',
      notes: 'Monthly restocking transfer.',
      items: {
        create: [
          {
            medicationId: ibuprofen.id,
            quantity: 50,
          },
        ],
      },
    },
  });

  console.log('✅ Stock transfers created.\n');

  // ==========================================
  // 11. ATTENDANCE
  // ==========================================
  console.log('🕐 Creating attendance records...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Yesterday - completed attendance for pharmacist
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const clockIn1 = new Date(yesterday);
  clockIn1.setHours(8, 2, 0, 0);
  const clockOut1 = new Date(yesterday);
  clockOut1.setHours(17, 5, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c66' },
    update: {},
    create: {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c66',
      staffId: pharmacistStaff.id,
      branchId: mainBranch.id,
      clockInTime: clockIn1,
      clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 10 },
      clockInApproved: true,
      clockInApprovedAt: new Date(clockIn1.getTime() + 5 * 60000),
      clockInApprovedBy: cashierStaff.id, // approved by another staff
      clockOutTime: clockOut1,
      clockOutLocation: { lat: -1.9441, lng: 30.0619, accuracy: 12 },
      clockOutApproved: true,
      clockOutApprovedAt: new Date(clockOut1.getTime() + 3 * 60000),
      clockOutApprovedBy: cashierStaff.id,
      status: 'COMPLETED',
      totalHours: 9.05,
    },
  });

  // Yesterday - completed attendance for cashier
  const clockIn2 = new Date(yesterday);
  clockIn2.setHours(9, 0, 0, 0);
  const clockOut2 = new Date(yesterday);
  clockOut2.setHours(18, 10, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'a2b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c67' },
    update: {},
    create: {
      id: 'a2b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c67',
      staffId: cashierStaff.id,
      branchId: mainBranch.id,
      clockInTime: clockIn2,
      clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 8 },
      clockInApproved: true,
      clockInApprovedAt: new Date(clockIn2.getTime() + 4 * 60000),
      clockInApprovedBy: pharmacistStaff.id,
      clockOutTime: clockOut2,
      clockOutLocation: { lat: -1.9441, lng: 30.0619, accuracy: 9 },
      clockOutApproved: true,
      clockOutApprovedAt: new Date(clockOut2.getTime() + 2 * 60000),
      clockOutApprovedBy: pharmacistStaff.id,
      status: 'COMPLETED',
      totalHours: 9.17,
    },
  });

  // Today - pharmacist clocked in, pending approval
  const clockIn3 = new Date(today);
  clockIn3.setHours(8, 5, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'a3b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c68' },
    update: {},
    create: {
      id: 'a3b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c68',
      staffId: pharmacistStaff.id,
      branchId: mainBranch.id,
      clockInTime: clockIn3,
      clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 15 },
      clockInApproved: false,
      status: 'PENDING',
    },
  });

  console.log('✅ Attendance records created.\n');

  // ==========================================
  // 12. NOTIFICATIONS
  // ==========================================
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      // Patient notification for completed order
      {
        patientId: patient1.id,
        orderId: completedOrder.id,
        type: 'ORDER_DELIVERED',
        title: 'Order Delivered',
        message: 'Your order ORD-2026-0001 has been delivered successfully. Thank you for choosing MedPlus Pharmacy!',
        isRead: true,
      },
      // Pharmacy notification for order placed
      {
        pharmacyId: pharmacy.id,
        orderId: pendingOrder.id,
        type: 'ORDER_PLACED',
        title: 'New Order Received',
        message: 'A new pickup order ORD-2026-0002 has been placed by Bob Habimana.',
        isRead: false,
      },
      // Patient notification for prescription approved
      {
        patientId: patient1.id,
        type: 'PRESCRIPTION_APPROVED',
        title: 'Prescription Approved',
        message: 'Your prescription has been reviewed and approved. You can now proceed to order your medications.',
        isRead: false,
      },
      // Pharmacy notification for low stock
      {
        pharmacyId: pharmacy.id,
        type: 'LOW_STOCK',
        title: 'Low Stock Alert',
        message: 'Omeprazole 20mg Capsules at MedPlus Main Branch is running low (8 units remaining, threshold: 10).',
        isRead: false,
      },
      // Patient notification for order accepted
      {
        patientId: patient1.id,
        orderId: acceptedOrder.id,
        type: 'ORDER_ACCEPTED',
        title: 'Order Accepted',
        message: 'Your order ORD-2026-0003 has been accepted and is being processed.',
        isRead: false,
      },
    ],
  });

  console.log('✅ Notifications created.\n');

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('='.repeat(60));
  console.log('🎉 Seed completed successfully!\n');
  console.log('📌 Test Credentials (all passwords: Test@1234)\n');
  console.log('Role              | Email');
  console.log('-'.repeat(55));
  console.log(`SUPER_ADMIN       | ${superAdminUser.email}`);
  console.log(`PHARMACY (owner)  | ${pharmacyUser.email}`);
  console.log(`BRANCH_MANAGER    | ${branchManagerUser.email}`);
  console.log(`PHARMACIST        | ${pharmacistUser.email}`);
  console.log(`CASHIER           | ${cashierUser.email}`);
  console.log(`PATIENT (Alice)   | ${patient1User.email}`);
  console.log(`PATIENT (Bob)     | ${patient2User.email}`);
  console.log('');
  console.log('⚠️  Super admin password:', process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminPower@2025');
  console.log('');
  console.log('🏥 Pharmacy:     MedPlus Pharmacy (APPROVED)');
  console.log('🏪 Branches:     Main Branch + Remera Branch (both APPROVED)');
  console.log(`💊 Medications:  ${medications.length} medications (8 main branch, 2 remera branch)`);
  console.log('📋 Prescriptions: 1 APPROVED (Alice), 1 PENDING (Bob)');
  console.log('🛒 Orders:       1 COMPLETED, 1 PENDING, 1 ACCEPTED');
  console.log('🔄 Transfers:    1 COMPLETED, 1 PENDING');
  console.log('🕐 Attendance:   2 COMPLETED (yesterday), 1 PENDING (today)');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

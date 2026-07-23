import {
  PrismaClient,
  UserRole,
  PharmacyStatus,
  BranchStatus,
  PaymentMethod,
  PaymentStatus,
  AppointmentStatus,
  HospitalBillingStatus,
  InvoiceStatus,
  OrderStatus,
  OrderType,
  StaffStatus,
  NotificationType,
  ClaimStatus,
} from '@prisma/client';
import { generateMRN } from '../utils/hospital';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const medicineImages = [
  'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=500&auto=format&fit=crop&q=60', // Pills container
  'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=60', // Blue pills
  'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=500&auto=format&fit=crop&q=60', // Capsules
  'https://images.unsplash.com/photo-1628771065518-0d82f15e8562?w=500&auto=format&fit=crop&q=60', // Medicine bottles
  'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=500&auto=format&fit=crop&q=60', // Syringe / liquid
  'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=60', // Pills on hand
  'https://images.unsplash.com/photo-1550572017-edd951b55104?w=500&auto=format&fit=crop&q=60', // White pills
];

const prisma = new PrismaClient();

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Test@1234';

// Fixed IDs for Idempotency
const IDS = {
  users: {
    superAdmin: '00000000-0000-0000-0000-000000000001',
    medplusOwner: '00000000-0000-0000-0000-000000000002',
    medplusManager: '00000000-0000-0000-0000-000000000003',
    medplusPharmacist: '00000000-0000-0000-0000-000000000004',
    medplusCashier: '00000000-0000-0000-0000-000000000005',
    ubumweOwner: '00000000-0000-0000-0000-000000000006',
    ubumweManager: '00000000-0000-0000-0000-000000000007',
    remeraOwner: '00000000-0000-0000-0000-000000000008',
    kigaliCentralOwner: '00000000-0000-0000-0000-000000000011',
    alice: '00000000-0000-0000-0000-000000000009',
    bob: '00000000-0000-0000-0000-000000000010',
    claire: '00000000-0000-0000-0000-000000000012',
    david: '00000000-0000-0000-0000-000000000013',
  },
  pharmacies: {
    medplus: '10000000-0000-0000-0000-000000000001',
    ubumwe: '10000000-0000-0000-0000-000000000002',
    remera: '10000000-0000-0000-0000-000000000003',
    kigaliCentral: '10000000-0000-0000-0000-000000000004',
  },
  branches: {
    medplusMain: '20000000-0000-0000-0000-000000000001',
    medplusRemera: '20000000-0000-0000-0000-000000000002',
    ubumweKimironko: '20000000-0000-0000-0000-000000000003',
    kigaliCentralMain: '20000000-0000-0000-0000-000000000004',
  },
};

async function main() {
  console.log('🌱 Starting idempotent seed (Upsert Mode)...\n');

  const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  // Use .env for Super Admin
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@evuze.rw';
  const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, HASH_ROUNDS)
    : password;

  // ==========================================
  // 1. USERS
  // ==========================================
  console.log('👤 Syncing users...');

  const users = [
    {
      id: IDS.users.superAdmin,
      email: ADMIN_EMAIL,
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      pass: ADMIN_PASSWORD,
    },
    {
      id: IDS.users.medplusOwner,
      email: 'owner@medplus.com',
      role: UserRole.PHARMACY,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.medplusManager,
      email: 'manager@medplus.com',
      role: UserRole.BRANCH_MANAGER,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.medplusPharmacist,
      email: 'pharmacist@medplus.com',
      role: UserRole.PHARMACIST,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.medplusCashier,
      email: 'cashier@medplus.com',
      role: UserRole.CASHIER,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.ubumweOwner,
      email: 'owner@ubumwepharma.com',
      role: UserRole.PHARMACY,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.ubumweManager,
      email: 'manager@ubumwepharma.com',
      role: UserRole.BRANCH_MANAGER,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.remeraOwner,
      email: 'owner@remerahealth.com',
      role: UserRole.PHARMACY,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.kigaliCentralOwner,
      email: 'owner@kigalicentralpharma.com',
      role: UserRole.PHARMACY,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.alice,
      email: 'alice@patient.com',
      role: UserRole.PATIENT,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.bob,
      email: 'bob@patient.com',
      role: UserRole.PATIENT,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.claire,
      email: 'claire@patient.com',
      role: UserRole.PATIENT,
      isVerified: true,
      pass: password,
    },
    {
      id: IDS.users.david,
      email: 'david@patient.com',
      role: UserRole.PATIENT,
      isVerified: true,
      pass: password,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        role: u.role,
        isVerified: u.isVerified,
        isActive: true,
        password: u.pass,
      },
      create: {
        id: u.id,
        email: u.email,
        role: u.role,
        isVerified: u.isVerified,
        password: u.pass,
        isActive: true,
      },
    });
  }

  // Get actual IDs from DB
  const getUserId = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    return u?.id;
  };

  // ==========================================
  // 2. PHARMACIES
  // ==========================================
  console.log('🏥 Syncing pharmacies...');

  const pharmacies = [
    {
      id: IDS.pharmacies.medplus,
      userEmail: 'owner@medplus.com',
      name: 'MedPlus Pharmacy',
      representativeName: 'Dr. Jean Damascene',
      phone: '+250788000001',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
      latitude: -1.9441,
      longitude: 30.0619,
      logoUrl: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=150',
      dateOfIncorporation: new Date('2018-03-15'),
      rdbCertificate: 'RDB-2018-001234',
      pharmacyLicense: 'LIC-2018-PH-001',
      status: PharmacyStatus.APPROVED,
      approvedAt: new Date('2018-04-01'),
    },
    {
      id: IDS.pharmacies.ubumwe,
      userEmail: 'owner@ubumwepharma.com',
      name: 'Ubumwe Pharmacy',
      representativeName: 'Uwimana Marie Claire',
      phone: '+250788000002',
      address: 'KG 11 Ave, Kimironko, Gasabo, Kigali',
      latitude: -1.9412,
      longitude: 30.1092,
      logoUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150',
      dateOfIncorporation: new Date('2019-06-20'),
      rdbCertificate: 'RDB-2019-004521',
      pharmacyLicense: 'LIC-2019-PH-022',
      status: PharmacyStatus.APPROVED,
      approvedAt: new Date('2019-07-10'),
    },
    {
      id: IDS.pharmacies.kigaliCentral,
      userEmail: 'owner@kigalicentralpharma.com',
      name: 'Kigali Central Pharmacy',
      representativeName: 'Mugisha Emmanuel',
      phone: '+250788000003',
      address: 'KN 3 Rd, City Centre, Nyarugenge, Kigali',
      latitude: -1.95,
      longitude: 30.0588,
      logoUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150',
      dateOfIncorporation: new Date('2020-01-10'),
      rdbCertificate: 'RDB-2020-005566',
      pharmacyLicense: 'LIC-2020-PH-055',
      status: PharmacyStatus.APPROVED,
      approvedAt: new Date('2020-02-01'),
    },
    {
      id: IDS.pharmacies.remera,
      userEmail: 'owner@remerahealth.com',
      name: 'Remera Health Pharmacy',
      representativeName: 'Habimana Patrick',
      phone: '+250788000004',
      address: 'KG 9 Ave, Remera, Gasabo, Kigali',
      latitude: -1.9559,
      longitude: 30.1125,
      logoUrl: 'https://images.unsplash.com/photo-1628771065518-0d82f15e8562?w=150',
      dateOfIncorporation: new Date('2023-08-05'),
      rdbCertificate: 'RDB-2023-009988',
      pharmacyLicense: 'LIC-2023-PH-099',
      status: PharmacyStatus.PENDING,
    },
  ];

  for (const p of pharmacies) {
    const { userEmail, ...pData } = p;
    const userId = await getUserId(userEmail);
    if (!userId) continue;

    const { id, ...updateData } = pData;

    await prisma.pharmacy.upsert({
      where: { userId },
      update: { ...updateData },
      create: { ...pData, userId },
    });
  }

  // ==========================================
  // 3. BRANCHES
  // ==========================================
  console.log('🏪 Syncing branches...');

  const branches = [
    {
      id: IDS.branches.medplusMain,
      pharmacyEmail: 'owner@medplus.com',
      managerEmail: 'manager@medplus.com',
      name: 'MedPlus Main Branch',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
      phone: '+250788000010',
      latitude: -1.9441,
      longitude: 30.0619,
      isActive: true,
      branchStatus: BranchStatus.APPROVED,
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
    {
      id: IDS.branches.medplusRemera,
      pharmacyEmail: 'owner@medplus.com',
      name: 'MedPlus Remera Branch',
      address: 'KG 9 Ave, Remera, Gasabo, Kigali',
      phone: '+250788000020',
      latitude: -1.9559,
      longitude: 30.1125,
      isActive: true,
      branchStatus: BranchStatus.APPROVED,
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
    {
      id: IDS.branches.ubumweKimironko,
      pharmacyEmail: 'owner@ubumwepharma.com',
      managerEmail: 'manager@ubumwepharma.com',
      name: 'Ubumwe Kimironko Branch',
      address: 'KG 11 Ave, Kimironko, Gasabo, Kigali',
      phone: '+250788000030',
      latitude: -1.9412,
      longitude: 30.1092,
      isActive: true,
      branchStatus: BranchStatus.APPROVED,
      branchManagerEmail: 'manager@ubumwepharma.com',
    },
    {
      id: IDS.branches.kigaliCentralMain,
      pharmacyEmail: 'owner@kigalicentralpharma.com',
      name: 'Kigali Central Main Branch',
      address: 'KN 3 Rd, City Centre, Nyarugenge, Kigali',
      phone: '+250788000040',
      latitude: -1.95,
      longitude: 30.0588,
      isActive: true,
      branchStatus: BranchStatus.APPROVED,
      branchManagerEmail: 'manager@kigalicentralpharma.com',
    },
  ];

  for (const b of branches) {
    const { pharmacyEmail, managerEmail, ...bData } = b;
    const owner = await prisma.user.findUnique({
      where: { email: pharmacyEmail },
      include: { pharmacy: true },
    });
    const pharmacyId = owner?.pharmacy?.id;
    if (!pharmacyId) continue;

    let managerId = null;
    if (managerEmail) {
      managerId = (await getUserId(managerEmail)) || null;
    }

    const { id, ...updateData } = bData;
    const whereClause = managerId ? { managerId } : { id: b.id };

    await prisma.branch.upsert({
      where: whereClause as any,
      update: { ...updateData, pharmacyId, managerId },
      create: { ...bData, id: b.id, pharmacyId, managerId },
    });
  }

  // ==========================================
  // 4. PATIENTS & STAFF
  // ==========================================
  console.log('🧑‍🤝‍🧑 Syncing patients & staff...');

  const patients = [
    {
      id: 'b39bcac3-9eae-4c50-b408-347fd13e9b33',
      email: 'alice@patient.com',
      firstName: 'Alice',
      lastName: 'Mukamana',
      address: 'KG 7 Ave, Kimironko, Gasabo, Kigali',
      insuranceProvider: 'RSSB',
      coverage: 80,
    },
    {
      id: 'c7dbe656-1869-45d1-a498-f6341cd54930',
      email: 'bob@patient.com',
      firstName: 'Bob',
      lastName: 'Habimana',
      address: 'KN 4 Ave, Nyarugenge, Kigali',
      insuranceProvider: null,
      coverage: 0,
    },
    {
      id: '1e14481d-5a94-4206-8b34-83c35044ae3d',
      email: 'claire@patient.com',
      firstName: 'Claire',
      lastName: 'Ingabire',
      address: 'KG 12 Ave, Remera, Gasabo, Kigali',
      insuranceProvider: 'MMI',
      coverage: 60,
    },
    {
      id: '6416e65b-a0be-40cb-bad8-c3f2ec4a8f7a',
      email: 'david@patient.com',
      firstName: 'David',
      lastName: 'Nshuti',
      address: 'Kicukiro District, Kigali, Rwanda',
      insuranceProvider: null,
      coverage: 0,
    },
  ];

  for (const p of patients) {
    const userId = await getUserId(p.email);
    if (!userId) continue;

    await prisma.patient.upsert({
      where: { userId },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        address: p.address,
      },
      create: {
        id: p.id,
        user: { connect: { id: userId } },
        firstName: p.firstName,
        lastName: p.lastName,
        mrn: generateMRN(),
        phone: '+250788' + Math.floor(Math.random() * 9000000 + 1000000),
        address: p.address,
        insuranceProvider: p.insuranceProvider,
        insuranceCoverage: p.coverage,
      },
    });
  }

  const pharmId = await getUserId('pharmacist@medplus.com');
  const medPlusMain = await prisma.branch.findFirst({
    where: { name: 'MedPlus Main Branch' },
  });

  if (pharmId && medPlusMain) {
    await prisma.staff.upsert({
      where: { userId: pharmId },
      update: { firstName: 'Samuel', status: 'ACTIVE' },
      create: {
        id: '86e18f92-8874-4d4c-b9e7-aaba80d6a11c',
        userId: pharmId,
        branchId: medPlusMain.id,
        firstName: 'Samuel',
        lastName: 'Nkurunziza',
        phone: '+250788100001',
        status: 'ACTIVE',
      },
    });
  }

  const cashierId = await getUserId('cashier@medplus.com');
  if (cashierId && medPlusMain) {
    await prisma.staff.upsert({
      where: { userId: cashierId },
      update: { firstName: 'Grace', status: 'ACTIVE' },
      create: {
        id: 'e091747a-6eec-4131-923f-f0e727ef4fb7',
        userId: cashierId,
        branchId: medPlusMain.id,
        firstName: 'Grace',
        lastName: 'Uwimana',
        phone: '+250788100002',
        status: 'ACTIVE',
      },
    });
  }

  // ==========================================
  // 5. MEDICATIONS & ORDERS
  // ==========================================
  console.log('🛒 Syncing medications & orders...');

  const medId = '30000000-0000-0000-0000-000000000001';
  if (medPlusMain && medPlusMain.pharmacyId) {
    await prisma.medication.upsert({
      where: { id: medId },
      update: { quantity: 200 },
      create: {
        id: medId,
        pharmacyId: medPlusMain.pharmacyId,
        branchId: medPlusMain.id,
        name: 'Amoxicillin 500mg',
        category: 'Antibiotics',
        price: 2500,
        quantity: 200,
        imageUrl: medicineImages[0],
      },
    });

    const aliceP = await prisma.patient.findFirst({
      where: { firstName: 'Alice' },
    });
    const bobP = await prisma.patient.findFirst({
      where: { firstName: 'Bob' },
    });

    if (aliceP && bobP) {
      const orders = [
        {
          orderNumber: 'ORD-2026-0001',
          patientId: aliceP.id,
          status: 'COMPLETED',
          paymentMethod: 'MTN_MOMO',
          paymentStatus: 'COMPLETED',
          patientPayment: 1200,
        },
        {
          orderNumber: 'ORD-2026-0002',
          patientId: bobP.id,
          status: 'PENDING',
          paymentMethod: 'CARD',
          paymentStatus: 'PENDING',
          patientPayment: 5600,
        },
        {
          orderNumber: 'ORD-2026-0003',
          patientId: aliceP.id,
          status: 'ACCEPTED',
          paymentMethod: 'CARD',
          paymentStatus: 'PENDING',
          patientPayment: 11000,
        },
        {
          orderNumber: 'ORD-2026-0004',
          patientId: aliceP.id,
          status: 'READY_FOR_PICKUP',
          paymentMethod: 'MTN_MOMO',
          paymentStatus: 'COMPLETED',
          patientPayment: 1600,
        },
        {
          orderNumber: 'ORD-2026-0005',
          patientId: bobP.id,
          status: 'READY_FOR_PICKUP',
          paymentMethod: 'CASH',
          paymentStatus: 'PENDING',
          patientPayment: 4500,
        },
        {
          orderNumber: 'ORD-2026-0006',
          patientId: bobP.id,
          status: 'PREPARING',
          paymentMethod: 'CARD',
          paymentStatus: 'PENDING',
          patientPayment: 11000,
        },
      ];

      for (const o of orders) {
        await prisma.order.upsert({
          where: { orderNumber: o.orderNumber },
          update: {
            status: o.status as any,
            paymentMethod: o.paymentMethod as any,
          },
          create: {
            ...(o as any),
            pharmacyId: medPlusMain.pharmacyId,
            branchId: medPlusMain.id,
            type: 'PICKUP',
            subtotal: 5000,
            total: 5000,
            orderItems: {
              create: [{ medicationId: medId, quantity: 1, price: 2500 }],
            },
          },
        });
      }
    }
  }

  // ==========================================
  // 6. ATTENDANCE & MISC
  // ==========================================
  console.log('🕐 Syncing attendance & misc...');

  const staffG = await prisma.staff.findFirst({
    where: { firstName: 'Grace' },
  });
  if (staffG && medPlusMain) {
    const today = new Date();
    today.setHours(8, 0, 0, 0);

    await prisma.attendance.upsert({
      where: { id: '40000000-0000-0000-0000-000000000001' },
      update: { status: 'COMPLETED' },
      create: {
        id: '40000000-0000-0000-0000-000000000001',
        staffId: staffG.id,
        branchId: medPlusMain.id,
        clockInTime: today,
        status: 'COMPLETED',
        clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 10 },
      },
    });
  }

  // ==========================================
  // 7. HOSPITALS, DOCTORS, APPOINTMENTS & INVOICES (Idempotent Hospital Seeding)
  // ==========================================
  console.log('🏥 Syncing hospitals, doctors, appointments & invoices...');

  // Create Hospital Admin Users
  const hospitalAdminEmails = ['admin@kingfaisal.com', 'admin@chuk.com'];
  for (const email of hospitalAdminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: {
        password: password,
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
        isActive: true,
      },
      create: {
        email,
        password: password,
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
        isActive: true,
      },
    });
  }

  const kfhAdminId = await getUserId('admin@kingfaisal.com');
  const chukAdminId = await getUserId('admin@chuk.com');

  // Create Hospitals
  const kfhId = '50000000-0000-0000-0000-000000000001';
  const chukId = '50000000-0000-0000-0000-000000000002';

  if (kfhAdminId) {
    await prisma.hospital.upsert({
      where: { userId: kfhAdminId },
      update: { name: 'King Faisal Hospital', status: PharmacyStatus.APPROVED },
      create: {
        id: kfhId,
        userId: kfhAdminId,
        name: 'King Faisal Hospital',
        address: 'KG 544 St, Kigali',
        phone: '+250788111111',
        status: PharmacyStatus.APPROVED,
        latitude: -1.9439,
        longitude: 30.0935,
      },
    });
  }

  if (chukAdminId) {
    await prisma.hospital.upsert({
      where: { userId: chukAdminId },
      update: {
        name: 'Kigali University Teaching Hospital (CHUK)',
        status: PharmacyStatus.APPROVED,
      },
      create: {
        id: chukId,
        userId: chukAdminId,
        name: 'Kigali University Teaching Hospital (CHUK)',
        address: 'KN 4 Ave, Nyarugenge, Kigali',
        phone: '+250788222222',
        status: PharmacyStatus.APPROVED,
        latitude: -1.9489,
        longitude: 30.0592,
      },
    });
  }

  // Create Doctor Users
  const doctorEmails = ['robert@chuk.com', 'eric@kingfaisal.com'];
  for (const email of doctorEmails) {
    await prisma.user.upsert({
      where: { email },
      update: {
        password: password,
        role: UserRole.DOCTOR,
        isVerified: true,
        isActive: true,
      },
      create: {
        email,
        password: password,
        role: UserRole.DOCTOR,
        isVerified: true,
        isActive: true,
      },
    });
  }

  const robertUserId = await getUserId('robert@chuk.com');
  const ericUserId = await getUserId('eric@kingfaisal.com');

  const robertDocId = '60000000-0000-4000-8000-000000000001';
  const ericDocId = '60000000-0000-4000-8000-000000000002';

  if (robertUserId) {
    await prisma.doctor.upsert({
      where: { userId: robertUserId },
      update: { specialization: 'Cardiology', isDepartmentHead: true },
      create: {
        id: robertDocId,
        userId: robertUserId,
        hospitalId: chukId,
        specialization: 'Cardiology',
        licenseNumber: 'RW-MED-12345',
        firstName: 'Robert',
        lastName: 'Niyonkuru',
        isAvailable: true,
        isDepartmentHead: true,
        bio: 'Senior Cardiologist specializing in heart rhythm disorders.',
      },
    });

    // Seed Doctor Schedules
    for (let day = 1; day <= 5; day++) {
      const scheduleId = `robert-schedule-day-${day}`;
      const existing = await prisma.doctorSchedule.findUnique({
        where: { id: scheduleId },
      });
      if (!existing) {
        await prisma.doctorSchedule.create({
          data: {
            id: scheduleId,
            doctorId: robertDocId,
            dayOfWeek: day,
            startTime: '08:00',
            endTime: '17:00',
          },
        });
      }
    }
  }

  if (ericUserId) {
    await prisma.doctor.upsert({
      where: { userId: ericUserId },
      update: { specialization: 'Pediatrics', isDepartmentHead: true },
      create: {
        id: ericDocId,
        userId: ericUserId,
        hospitalId: kfhId,
        specialization: 'Pediatrics',
        licenseNumber: 'RW-MED-67890',
        firstName: 'Eric',
        lastName: 'Havugimana',
        isAvailable: true,
        isDepartmentHead: true,
        bio: 'Compassionate Pediatrician with 8+ years of experience.',
      },
    });

    // Seed Doctor Schedules
    for (let day = 1; day <= 5; day++) {
      const scheduleId = `eric-schedule-day-${day}`;
      const existing = await prisma.doctorSchedule.findUnique({
        where: { id: scheduleId },
      });
      if (!existing) {
        await prisma.doctorSchedule.create({
          data: {
            id: scheduleId,
            doctorId: ericDocId,
            dayOfWeek: day,
            startTime: '08:00',
            endTime: '17:00',
          },
        });
      }
    }
  }

  // Create Hospital Configs
  await prisma.hospitalConfig.upsert({
    where: { hospitalId: chukId },
    update: { consultationFee: 10000, triageFee: 3000 },
    create: {
      id: '879a7899-beac-4c20-a463-66e111740b61',
      hospitalId: chukId,
      consultationFee: 10000,
      triageFee: 3000,
    },
  });

  await prisma.hospitalConfig.upsert({
    where: { hospitalId: kfhId },
    update: { consultationFee: 25000, triageFee: 5000 },
    create: {
      id: '736789d0-f12e-4476-ba23-e38c4e5c98d1',
      hospitalId: kfhId,
      consultationFee: 25000,
      triageFee: 5000,
    },
  });

  // Create Patient Hospital Registrations (CHUK & King Faisal)
  const alicePatient = await prisma.patient.findFirst({
    where: { firstName: 'Alice' },
  });
  const bobPatient = await prisma.patient.findFirst({
    where: { firstName: 'Bob' },
  });

  if (alicePatient) {
    const regId = `reg-alice-chuk`;
    const existing = await prisma.hospitalPatientRegistration.findUnique({
      where: { id: regId },
    });
    if (!existing) {
      await prisma.hospitalPatientRegistration.create({
        data: {
          id: regId,
          patientId: alicePatient.id,
          hospitalId: chukId,
          mrn: alicePatient.mrn,
        },
      });
    }
  }

  if (bobPatient) {
    const regId = `reg-bob-kfh`;
    const existing = await prisma.hospitalPatientRegistration.findUnique({
      where: { id: regId },
    });
    if (!existing) {
      await prisma.hospitalPatientRegistration.create({
        data: {
          id: regId,
          patientId: bobPatient.id,
          hospitalId: kfhId,
          mrn: bobPatient.mrn,
        },
      });
    }
  }

  // Seed Predictable Appointments and Invoices
  if (alicePatient && robertDocId) {
    // 1. Unpaid Hospital Invoice for testing
    const apptId1 = '70000000-0000-0000-0000-000000000001';
    const apptExisting1 = await prisma.appointment.findUnique({
      where: { id: apptId1 },
    });
    if (!apptExisting1) {
      await prisma.appointment.create({
        data: {
          id: apptId1,
          patientId: alicePatient.id,
          doctorId: robertDocId,
          hospitalId: chukId,
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          status: AppointmentStatus.COMPLETED,
          reason: 'Routine Cardiac Followup',
        },
      });
    }

    const hInvoiceId1 = '00000000-0000-0000-0000-000000000100';
    const hInvoiceExisting1 = await prisma.hospitalInvoice.findUnique({
      where: { id: hInvoiceId1 },
    });
    if (!hInvoiceExisting1) {
      await prisma.hospitalInvoice.create({
        data: {
          id: hInvoiceId1,
          appointmentId: apptId1,
          patientId: alicePatient.id,
          hospitalId: chukId,
          totalAmount: 13000,
          paymentStatus: HospitalBillingStatus.UNPAID,
          issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: 'Cardiology Consultation',
                quantity: 1,
                unitCost: 10000,
                subtotal: 10000,
                category: 'CONSULTATION',
              },
              {
                description: 'Triage Check',
                quantity: 1,
                unitCost: 3000,
                subtotal: 3000,
                category: 'TRIAGE',
              },
            ],
          },
        },
      });
    }

    const invoiceId1 = '00000000-0000-0000-0000-000000000101';
    const invoiceExisting1 = await prisma.invoice.findUnique({
      where: { id: invoiceId1 },
    });
    if (!invoiceExisting1) {
      await prisma.invoice.create({
        data: {
          id: invoiceId1,
          appointmentId: apptId1,
          patientId: alicePatient.id,
          hospitalId: chukId,
          totalAmount: 13000,
          status: InvoiceStatus.UNPAID,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: 'Cardiology Consultation',
                quantity: 1,
                unitPrice: 10000,
                subtotal: 10000,
              },
              {
                description: 'Triage Check',
                quantity: 1,
                unitPrice: 3000,
                subtotal: 3000,
              },
            ],
          },
        },
      });
    }

    // 2. Paid Hospital Invoice with Payments logged
    const apptId2 = '70000000-0000-0000-0000-000000000002';
    const apptExisting2 = await prisma.appointment.findUnique({
      where: { id: apptId2 },
    });
    if (!apptExisting2) {
      await prisma.appointment.create({
        data: {
          id: apptId2,
          patientId: alicePatient.id,
          doctorId: robertDocId,
          hospitalId: chukId,
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          status: AppointmentStatus.COMPLETED,
          reason: 'Chest pain examination',
        },
      });
    }

    const hInvoiceId2 = '00000000-0000-0000-0000-000000000200';
    const hInvoiceExisting2 = await prisma.hospitalInvoice.findUnique({
      where: { id: hInvoiceId2 },
    });
    if (!hInvoiceExisting2) {
      await prisma.hospitalInvoice.create({
        data: {
          id: hInvoiceId2,
          appointmentId: apptId2,
          patientId: alicePatient.id,
          hospitalId: chukId,
          totalAmount: 13000,
          paymentStatus: HospitalBillingStatus.PAID,
          issuedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: 'Cardiology Consultation',
                quantity: 1,
                unitCost: 10000,
                subtotal: 10000,
                category: 'CONSULTATION',
              },
              {
                description: 'Triage Check',
                quantity: 1,
                unitCost: 3000,
                subtotal: 3000,
                category: 'TRIAGE',
              },
            ],
          },
        },
      });
    }

    const invoiceId2 = '00000000-0000-0000-0000-000000000201';
    const invoiceExisting2 = await prisma.invoice.findUnique({
      where: { id: invoiceId2 },
    });
    if (!invoiceExisting2) {
      await prisma.invoice.create({
        data: {
          id: invoiceId2,
          appointmentId: apptId2,
          patientId: alicePatient.id,
          hospitalId: chukId,
          totalAmount: 13000,
          status: InvoiceStatus.PAID,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: 'Cardiology Consultation',
                quantity: 1,
                unitPrice: 10000,
                subtotal: 10000,
              },
              {
                description: 'Triage Check',
                quantity: 1,
                unitPrice: 3000,
                subtotal: 3000,
              },
            ],
          },
        },
      });
    }

    // Seed payments for the paid general invoice
    const paymentId2 = 'payment-seed-record-2';
    const paymentExisting2 = await prisma.hospitalPayment.findUnique({
      where: { id: paymentId2 },
    });
    if (!paymentExisting2) {
      await prisma.hospitalPayment.create({
        data: {
          id: paymentId2,
          invoiceId: invoiceId2,
          patientId: alicePatient.id,
          amount: 13000,
          method: PaymentMethod.MTN_MOMO,
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          notes: 'Seeded payment record for paid test invoice',
        },
      });
    }

    // 3. Insurance Pending Claim
    const apptId3 = '70000000-0000-0000-0000-000000000003';
    const apptExisting3 = await prisma.appointment.findUnique({
      where: { id: apptId3 },
    });
    if (!apptExisting3) {
      await prisma.appointment.create({
        data: {
          id: apptId3,
          patientId: alicePatient.id,
          doctorId: robertDocId,
          hospitalId: chukId,
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
          status: AppointmentStatus.COMPLETED,
          reason: 'Emergency consult',
        },
      });
    }

    const hInvoiceId3 = '00000000-0000-0000-0000-000000000300';
    const hInvoiceExisting3 = await prisma.hospitalInvoice.findUnique({
      where: { id: hInvoiceId3 },
    });
    if (!hInvoiceExisting3) {
      await prisma.hospitalInvoice.create({
        data: {
          id: hInvoiceId3,
          appointmentId: apptId3,
          patientId: alicePatient.id,
          hospitalId: chukId,
          totalAmount: 13000,
          paymentStatus: HospitalBillingStatus.INSURANCE_PENDING,
          insuranceCovered: true,
          issuedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: 'Cardiology Consultation',
                quantity: 1,
                unitCost: 10000,
                subtotal: 10000,
                category: 'CONSULTATION',
              },
              {
                description: 'Triage Check',
                quantity: 1,
                unitCost: 3000,
                subtotal: 3000,
                category: 'TRIAGE',
              },
            ],
          },
        },
      });
    }

    // Seed InsuranceClaim for hInvoiceId3
    const claimId3 = 'claim-seed-record-3';
    const claimExisting3 = await prisma.insuranceClaim.findUnique({
      where: { id: claimId3 },
    });
    if (!claimExisting3) {
      await prisma.insuranceClaim.create({
        data: {
          id: claimId3,
          invoiceId: hInvoiceId3,
          provider: 'RSSB',
          claimAmount: 13000,
          settledAmount: 0,
          difference: 0,
          status: ClaimStatus.PENDING,
        },
      });
    }
  }

  // ==========================================
  // 7b. HOSPITAL DRUG STOCK
  // ==========================================
  console.log('💊 Seeding hospital drug stock...');
  const stockDrugs = await prisma.medicationRegistry.findMany({ take: 12 });

  const STOCK_ENTRIES = [
    { qty: 150, reorder: 20, unitPrice: 2500, daysUntilExpiry: 540 },
    { qty: 8,   reorder: 15, unitPrice: 4800, daysUntilExpiry: 45  }, // low-stock + expiring
    { qty: 200, reorder: 30, unitPrice: 1200, daysUntilExpiry: 730 },
    { qty: 0,   reorder: 10, unitPrice: 900,  daysUntilExpiry: -5  }, // low-stock + expired
    { qty: 75,  reorder: 10, unitPrice: 6500, daysUntilExpiry: 400 },
    { qty: 12,  reorder: 25, unitPrice: 3200, daysUntilExpiry: 55  }, // low-stock + expiring
    { qty: 320, reorder: 50, unitPrice: 750,  daysUntilExpiry: 600 },
    { qty: 5,   reorder: 10, unitPrice: 11000,daysUntilExpiry: 365 }, // low-stock
    { qty: 90,  reorder: 15, unitPrice: 2100, daysUntilExpiry: 800 },
    { qty: 45,  reorder: 20, unitPrice: 5500, daysUntilExpiry: 180 },
    { qty: 18,  reorder: 30, unitPrice: 3800, daysUntilExpiry: 30  }, // expiring
    { qty: 110, reorder: 10, unitPrice: 1600, daysUntilExpiry: 900 },
  ];

  for (let i = 0; i < stockDrugs.length; i++) {
    const drug = stockDrugs[i];
    const entry = STOCK_ENTRIES[i % STOCK_ENTRIES.length];
    const expiryDate = new Date(Date.now() + entry.daysUntilExpiry * 24 * 60 * 60 * 1000);

    for (const hospitalId of [kfhId, chukId]) {
      await prisma.hospitalDrugStock.upsert({
        where: { drugId_hospitalId: { drugId: drug.id, hospitalId } },
        update: {},
        create: {
          drugId: drug.id,
          hospitalId,
          quantity: entry.qty,
          reorderLevel: entry.reorder,
          unitPrice: entry.unitPrice,
          expiryDate,
        },
      });
    }
  }

  // ==========================================
  // 8. ADDITIONAL FAKER-BASED SEEDING (Merged from seed-full.ts in Idempotent Mode)
  // ==========================================
  console.log(
    '\n🏥 Seeding additional Faker-based Pharmacies, Branches & Staff...',
  );
  const fakerPharmacies = [];
  const fakerBranches = [];
  const fakerPharmacyStaff = [];

  const realisticPharmacyNames = [
    'Kacyiru Health Pharmacy',
    'Gikondo Community Pharmacy',
    'Nyamirambo Care Pharmacy',
    'Kicukiro Heights Pharmacy',
    'Kanombe Wellness Pharmacy',
  ];

  const realisticLogoUrls = [
    'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=150',
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150',
    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150',
    'https://images.unsplash.com/photo-1628771065518-0d82f15e8562?w=150',
    'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=150',
  ];

  for (let i = 0; i < 5; i++) {
    const ownerEmail = `owner${i + 1}@pharmacy.com`;
    const ownerUserId = `00000000-0000-0000-0001-00000000000${i}`;
    const pharmacyId = `10000000-0000-0000-0001-00000000000${i}`;

    const owner = await prisma.user.upsert({
      where: { email: ownerEmail },
      update: {
        role: UserRole.PHARMACY,
        isVerified: true,
        isActive: true,
        password: password,
      },
      create: {
        id: ownerUserId,
        email: ownerEmail,
        role: UserRole.PHARMACY,
        isVerified: true,
        password: password,
        isActive: true,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      },
    });

    const coords = getKigaliCoordinates();
    const pharmacy = await prisma.pharmacy.upsert({
      where: { userId: owner.id },
      update: {
        name: realisticPharmacyNames[i],
        logoUrl: realisticLogoUrls[i],
        status: PharmacyStatus.APPROVED,
        approvedAt: new Date('2026-01-01'),
      },
      create: {
        id: pharmacyId,
        userId: owner.id,
        name: realisticPharmacyNames[i],
        logoUrl: realisticLogoUrls[i],
        phone: '+250788' + faker.string.numeric(6),
        address: faker.location.streetAddress() + ', Kigali',
        latitude: coords.latitude,
        longitude: coords.longitude,
        status: PharmacyStatus.APPROVED,
        approvedAt: new Date('2026-01-01'),
      },
    });
    fakerPharmacies.push(pharmacy);

    // Create 2 branches per pharmacy
    for (let j = 0; j < 2; j++) {
      const branchManagerEmail = `manager${i}_${j}@manager.com`;
      const managerUserId = `00000000-0000-0000-0002-0000000000${i}${j}`;
      const branchId = `20000000-0000-0000-0001-0000000000${i}${j}`;

      const manager = await prisma.user.upsert({
        where: { email: branchManagerEmail },
        update: {
          role: UserRole.BRANCH_MANAGER,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: managerUserId,
          email: branchManagerEmail,
          role: UserRole.BRANCH_MANAGER,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const bCoords = getKigaliCoordinates();
      const branch = await prisma.branch.upsert({
        where: { managerId: manager.id },
        update: {
          name: `${pharmacy.name} - ${j === 0 ? 'Main Branch' : 'Express Branch'}`,
          isActive: true,
          status: BranchStatus.APPROVED,
          branchStatus: BranchStatus.APPROVED,
        },
        create: {
          id: branchId,
          pharmacyId: pharmacy.id,
          managerId: manager.id,
          name: `${pharmacy.name} - ${j === 0 ? 'Main Branch' : 'Express Branch'}`,
          address: faker.location.streetAddress() + ', Kigali',
          phone: '+250788' + faker.string.numeric(6),
          latitude: bCoords.latitude,
          longitude: bCoords.longitude,
          status: BranchStatus.APPROVED,
          branchStatus: BranchStatus.APPROVED,
          isActive: true,
        },
      });
      fakerBranches.push(branch);

      // Pharmacist
      const pharmacistEmail = `pharmacist${i}_${j}@pharmacy.com`;
      const pharmacistUserId = `00000000-0000-0000-0003-0000000000${i}${j}`;
      const pharmacistStaffId = `30000000-0000-0000-0001-0000000000${i}${j}`;

      const pharmacistUser = await prisma.user.upsert({
        where: { email: pharmacistEmail },
        update: {
          role: UserRole.PHARMACIST,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: pharmacistUserId,
          email: pharmacistEmail,
          role: UserRole.PHARMACIST,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const pharmacist = await prisma.staff.upsert({
        where: { userId: pharmacistUser.id },
        update: {
          branchId: branch.id,
          status: StaffStatus.ACTIVE,
        },
        create: {
          id: pharmacistStaffId,
          userId: pharmacistUser.id,
          branchId: branch.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          status: StaffStatus.ACTIVE,
        },
      });

      // Cashier
      const cashierEmail = `cashier${i}_${j}@pharmacy.com`;
      const cashierUserId = `00000000-0000-0000-0004-0000000000${i}${j}`;
      const cashierStaffId = `40000000-0000-0000-0001-0000000000${i}${j}`;

      const cashierUser = await prisma.user.upsert({
        where: { email: cashierEmail },
        update: {
          role: UserRole.CASHIER,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: cashierUserId,
          email: cashierEmail,
          role: UserRole.CASHIER,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const cashier = await prisma.staff.upsert({
        where: { userId: cashierUser.id },
        update: {
          branchId: branch.id,
          status: StaffStatus.ACTIVE,
        },
        create: {
          id: cashierStaffId,
          userId: cashierUser.id,
          branchId: branch.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          status: StaffStatus.ACTIVE,
        },
      });

      fakerPharmacyStaff.push(pharmacist, cashier);

      await prisma.staffPermissions.upsert({
        where: { staffId: pharmacist.id },
        update: {
          permissions: [
            'VIEW_INVENTORY',
            'ADD_MEDICATION',
            'EDIT_MEDICATION',
            'VIEW_PRESCRIPTIONS',
            'APPROVE_PRESCRIPTIONS',
            'REJECT_PRESCRIPTIONS',
          ],
        },
        create: {
          staffId: pharmacist.id,
          permissions: [
            'VIEW_INVENTORY',
            'ADD_MEDICATION',
            'EDIT_MEDICATION',
            'VIEW_PRESCRIPTIONS',
            'APPROVE_PRESCRIPTIONS',
            'REJECT_PRESCRIPTIONS',
          ],
        },
      });

      await prisma.staffPermissions.upsert({
        where: { staffId: cashier.id },
        update: {
          permissions: ['VIEW_INVENTORY', 'VIEW_PAYMENTS', 'PROCESS_PAYMENTS'],
        },
        create: {
          staffId: cashier.id,
          permissions: ['VIEW_INVENTORY', 'VIEW_PAYMENTS', 'PROCESS_PAYMENTS'],
        },
      });
    }
  }

  console.log('🏥 Seeding additional Faker-based Hospitals & Doctors...');
  const fakerHospitals = [];
  const fakerDoctors = [];
  const fakerHospitalStaffList = [];

  for (let i = 0; i < 3; i++) {
    const adminEmail = `hospitaladmin${i + 1}@hospital.com`;
    const adminUserId = `00000000-0000-0000-0005-00000000000${i}`;
    const hospitalId = `50000000-0000-0000-0001-00000000000${i}`;

    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
        isActive: true,
        password: password,
      },
      create: {
        id: adminUserId,
        email: adminEmail,
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
        password: password,
        isActive: true,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      },
    });

    const hCoords = getKigaliCoordinates();
    const hospital = await prisma.hospital.upsert({
      where: { userId: adminUser.id },
      update: {
        name: `Faker Hospital ${i + 1}`,
        status: PharmacyStatus.APPROVED,
      },
      create: {
        id: hospitalId,
        userId: adminUser.id,
        name: `Faker Hospital ${i + 1}`,
        address: faker.location.streetAddress() + ', Kigali',
        phone: '+250788' + faker.string.numeric(6),
        latitude: hCoords.latitude,
        longitude: hCoords.longitude,
        status: PharmacyStatus.APPROVED,
      },
    });
    fakerHospitals.push(hospital);

    // Create 3 hospital staff per hospital
    const departmentsList = [
      'Cardiology',
      'Pediatrics',
      'General Practice',
      'Orthopedics',
      'Dermatology',
    ];

    for (let j = 0; j < 3; j++) {
      const hStaffEmail = `nurse${i}_${j}@hospital.com`;
      const nurseUserId = `00000000-0000-0000-0006-0000000000${i}${j}`;
      const nurseStaffId = `60000000-0000-0000-0001-0000000000${i}${j}`;
      const nurseDepartment = departmentsList[j % departmentsList.length];

      const hStaffUser = await prisma.user.upsert({
        where: { email: hStaffEmail },
        update: {
          role: UserRole.NURSE,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: nurseUserId,
          email: hStaffEmail,
          role: UserRole.NURSE,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const hStaff = await prisma.hospitalStaff.upsert({
        where: { userId: hStaffUser.id },
        update: {
          hospitalId: hospital.id,
          status: StaffStatus.ACTIVE,
          department: nurseDepartment,
        },
        create: {
          id: nurseStaffId,
          userId: hStaffUser.id,
          hospitalId: hospital.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          phone: '+250788' + faker.string.numeric(6),
          status: StaffStatus.ACTIVE,
          department: nurseDepartment,
        },
      });
      fakerHospitalStaffList.push(hStaff);
    }
    // Receptionists
    for (let j = 0; j < 2; j++) {
      const recEmail = j === 0 && i === 0 ? 'receptionist@ubumwe.com' : `receptionist${i}_${j}@hospital.com`;
      const recUserId = `00000000-0000-0000-0008-0000000000${i}${j}`;
      const recStaffId = `80000000-0000-0000-0001-0000000000${i}${j}`;

      const recUser = await prisma.user.upsert({
        where: { email: recEmail },
        update: {
          role: UserRole.RECEPTIONIST,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: recUserId,
          email: recEmail,
          role: UserRole.RECEPTIONIST,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const recStaff = await prisma.hospitalStaff.upsert({
        where: { userId: recUser.id },
        update: {
          hospitalId: hospital.id,
          status: StaffStatus.ACTIVE,
        },
        create: {
          id: recStaffId,
          userId: recUser.id,
          hospitalId: hospital.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          phone: '+250788' + faker.string.numeric(6),
          status: StaffStatus.ACTIVE,
        },
      });
      fakerHospitalStaffList.push(recStaff);
    }

    // Doctors
    const specialties = [
      'Cardiology',
      'Pediatrics',
      'General Practice',
      'Orthopedics',
      'Dermatology',
    ];

    for (let j = 0; j < 5; j++) {
      const docEmail = `doctor${i}_${j}@hospital.com`;
      const doctorUserId = `00000000-0000-0000-0007-0000000000${i}${j}`;
      const doctorId = `70000000-0000-0000-0001-0000000000${i}${j}`;
      const docSpecialization = specialties[j % specialties.length];
      const isDocDeptHead = j < 3; // First 3 specialties have heads

      const docUser = await prisma.user.upsert({
        where: { email: docEmail },
        update: {
          role: UserRole.DOCTOR,
          isVerified: true,
          isActive: true,
          password: password,
        },
        create: {
          id: doctorUserId,
          email: docEmail,
          role: UserRole.DOCTOR,
          isVerified: true,
          password: password,
          isActive: true,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
        },
      });

      const doctor = await prisma.doctor.upsert({
        where: { userId: docUser.id },
        update: {
          hospitalId: hospital.id,
          specialization: docSpecialization,
          isAvailable: true,
          isDepartmentHead: isDocDeptHead,
        },
        create: {
          id: doctorId,
          userId: docUser.id,
          hospitalId: hospital.id,
          firstName: docUser.firstName || faker.person.firstName(),
          lastName: docUser.lastName || faker.person.lastName(),
          specialization: docSpecialization,
          licenseNumber: 'RW-MED-' + faker.string.numeric(5) + `-${i}-${j}`,
          isAvailable: true,
          isDepartmentHead: isDocDeptHead,
          bio: faker.person.bio(),
        },
      });
      fakerDoctors.push(doctor);

      // Doctor Schedules (Mon-Fri)
      for (let day = 1; day <= 5; day++) {
        await prisma.doctorSchedule.upsert({
          where: {
            doctorId_dayOfWeek_startTime: {
              doctorId: doctor.id,
              dayOfWeek: day,
              startTime: '08:00',
            },
          },
          update: {
            endTime: '17:00',
          },
          create: {
            doctorId: doctor.id,
            dayOfWeek: day,
            startTime: '08:00',
            endTime: '17:00',
          },
        });
      }
    }
  }

  console.log('🧑‍🤝‍🧑 Seeding additional Faker-based Patients...');
  const fakerPatients = [];
  for (let k = 0; k < 50; k++) {
    const patientEmail = `patient${k + 1}@patient.com`;
    const patientUserId = `00000000-0000-0000-0008-0000000000${k.toString().padStart(2, '0')}`;
    const patientId = `80000000-0000-0000-0001-0000000000${k.toString().padStart(2, '0')}`;

    const patientUser = await prisma.user.upsert({
      where: { email: patientEmail },
      update: {
        role: UserRole.PATIENT,
        isVerified: true,
        isActive: true,
        password: password,
      },
      create: {
        id: patientUserId,
        email: patientEmail,
        role: UserRole.PATIENT,
        isVerified: true,
        password: password,
        isActive: true,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      },
    });

    const patient = await prisma.patient.upsert({
      where: { userId: patientUser.id },
      update: {
        firstName: patientUser.firstName || 'Patient',
        lastName: patientUser.lastName || `${k + 1}`,
      },
      create: {
        id: patientId,
        userId: patientUser.id,
        firstName: patientUser.firstName || faker.person.firstName(),
        lastName: patientUser.lastName || faker.person.lastName(),
        phone: '+250788' + faker.string.numeric(6),
        address: faker.location.streetAddress() + ', Kigali',
        mrn: 'MRN-' + faker.string.numeric(6) + `-${k}`,
        nationalId: faker.string.numeric(16),
        insuranceProvider: faker.helpers.arrayElement([
          'RSSB',
          'MMI',
          'RADIANT',
          null,
        ]),
        insuranceCoverage: faker.helpers.arrayElement([0, 50, 80, 100]),
      },
    });
    fakerPatients.push(patient);

    // Register Patient at a deterministic hospital
    const hospital = fakerHospitals[k % fakerHospitals.length];
    await prisma.hospitalPatientRegistration.upsert({
      where: {
        patientId_hospitalId: {
          patientId: patient.id,
          hospitalId: hospital.id,
        },
      },
      update: {
        mrn: patient.mrn || `MRN-REG-${k}`,
      },
      create: {
        patientId: patient.id,
        hospitalId: hospital.id,
        mrn: patient.mrn || `MRN-REG-${k}`,
      },
    });
  }

  console.log('📝 Seeding Medication Registry from CSV file...');
  const csvFilePath = path.join(__dirname, '../../medication-registry.csv');

  if (fs.existsSync(csvFilePath)) {
    const fileStream = fs.createReadStream(csvFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let csvHeaders: string[] = [];
    let csvRowCount = 0;
    const registryRecords: any[] = [];
    const seenRegNos = new Set<string>();
    let lineBuffer = '';

    for await (const line of rl) {
      if (lineBuffer) {
        lineBuffer += '\n' + line;
      } else {
        lineBuffer = line;
      }

      const quoteCount = (lineBuffer.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) continue;

      const recordText = lineBuffer;
      lineBuffer = '';
      if (!recordText.trim()) continue;

      const columns = parseCSVLine(recordText);

      if (csvRowCount === 0) {
        csvHeaders = columns.map((h) => h.toLowerCase().trim());
        csvRowCount++;
        continue;
      }

      try {
        const getVal = (index: number, ...possibleHeaders: string[]) => {
          for (const ph of possibleHeaders) {
            const foundIdx = csvHeaders.findIndex((h) =>
              h.includes(ph.toLowerCase()),
            );
            if (foundIdx !== -1 && columns[foundIdx])
              return columns[foundIdx].trim();
          }
          return columns[index] ? columns[index].trim() : '';
        };

        const registrationNumber = getVal(1, 'registration no');
        if (!registrationNumber) continue;

        const cleanDate = (str: string) => {
          if (!str) return undefined;
          return str.split('\n')[0].trim();
        };

        const regDateStr = cleanDate(getVal(14, 'registration date'));
        const expDateStr = cleanDate(getVal(15, 'expiry date'));

        const record = {
          registrationNumber,
          brandName: getVal(2, 'brand name', 'product name'),
          genericName: getVal(3, 'generic name'),
          dosageStrength: getVal(4, 'strength', 'dosage strength'),
          dosageForm: getVal(5, 'dosage form', 'form'),
          packSize: getVal(6, 'pack size'),
          packagingType: getVal(7, 'packaging type', 'packaging'),
          shelfLife: getVal(8, 'shelf life'),
          manufacturerName: getVal(9, 'manufacturer'),
          manufacturerAddress: getVal(10, 'address'),
          manufacturerCountry: getVal(11, 'country'),
          marketingAuthHolder: getVal(12, 'mah', 'holder'),
          localTechRep: getVal(13, 'ltr', 'representative'),
          registrationDate: parseDate(regDateStr),
          expiryDate: parseDate(expDateStr),
        };

        if (!seenRegNos.has(record.registrationNumber)) {
          seenRegNos.add(record.registrationNumber);
          registryRecords.push(record);
        }
      } catch {
        // Ignore row error
      }
      csvRowCount++;
    }

    console.log(
      `📥 Bulk importing ${registryRecords.length} records into medication_registry...`,
    );
    await prisma.medicationRegistry.createMany({
      data: registryRecords,
      skipDuplicates: true,
    });
  } else {
    console.warn(
      `⚠️  CSV not found at ${csvFilePath} — skipping registry import`,
    );
  }

  const registryItems = await prisma.medicationRegistry.findMany();
  const registryIds = registryItems.map((r) => r.id);
  const fakerMedications = [];
  const baseMeds = [
    'Amoxicillin',
    'Paracetamol',
    'Ibuprofen',
    'Cetirizine',
    'Omeprazole',
    'Metformin',
    'Amlodipine',
  ];

  console.log('💊 Seeding additional Medications for Faker branches...');
  for (let i = 0; i < fakerPharmacies.length; i++) {
    const pharmacy = fakerPharmacies[i];
    for (let j = 0; j < 2; j++) {
      const branch = fakerBranches[i * 2 + j];
      const branchId = branch.id;
      for (let m = 0; m < 10; m++) {
        const medId = `90000000-0000-0000-0000-00000000${i}${j}${m.toString().padStart(2, '0')}`;
        const isRegistryLinked =
          registryIds.length > 0 && (i + j + m) % 2 === 0;
        const regItem = isRegistryLinked
          ? registryItems[(i + j + m) % registryItems.length]
          : null;

        const med = await prisma.medication.upsert({
          where: { id: medId },
          update: {
            quantity: 150,
          },
          create: {
            id: medId,
            branchId: branchId,
            pharmacyId: pharmacy.id,
            registryId: isRegistryLinked ? regItem?.id : null,
            name: isRegistryLinked
              ? regItem.brandName
              : baseMeds[(i + j + m) % baseMeds.length] +
                ' ' +
                (m + 1) * 10 +
                'mg',
            price: 500 + m * 200,
            quantity: 150,
            requiresPrescription: m % 3 === 0,
            imageUrl: medicineImages[(i + j + m) % medicineImages.length],
          },
        });
        fakerMedications.push(med);
      }
    }
  }

  console.log('📅 Seeding additional Appointments & Invoices...');
  for (let i = 0; i < 50; i++) {
    const appointmentId = `a0000000-0000-0000-0000-0000000000${i.toString().padStart(2, '0')}`;
    const patient = fakerPatients[i % fakerPatients.length];
    const doctor = fakerDoctors[i % fakerDoctors.length];
    const dayStr = ((i % 28) + 1).toString().padStart(2, '0');
    const apptDate = new Date(`2026-05-${dayStr}T10:00:00Z`);

    const appointment = await prisma.appointment.upsert({
      where: { id: appointmentId },
      update: {
        status:
          i % 2 === 0
            ? AppointmentStatus.COMPLETED
            : AppointmentStatus.SCHEDULED,
        date: apptDate,
      },
      create: {
        id: appointmentId,
        patientId: patient.id,
        doctorId: doctor.id,
        hospitalId: doctor.hospitalId,
        date: apptDate,
        status:
          i % 2 === 0
            ? AppointmentStatus.COMPLETED
            : AppointmentStatus.SCHEDULED,
        reason: 'General Consultation',
      },
    });

    if (i % 2 === 0) {
      // Completed, so seed Hospital Invoice
      const existingInvoice = await prisma.hospitalInvoice.findUnique({
        where: { appointmentId },
      });
      if (!existingInvoice) {
        await prisma.hospitalInvoice.create({
          data: {
            appointmentId,
            patientId: patient.id,
            hospitalId: doctor.hospitalId,
            totalAmount: 15000,
            paymentStatus: 'PAID',
            issuedAt: apptDate,
            items: {
              create: [
                {
                  description: 'Consultation Fee',
                  quantity: 1,
                  unitCost: 15000,
                  subtotal: 15000,
                  category: 'CONSULTATION',
                },
              ],
            },
          },
        });
      }

      // Seed Prescription
      if (i % 3 === 0) {
        const prescriptionId = `p0000000-0000-0000-0000-0000000000${i.toString().padStart(2, '0')}`;
        const existingPresc = await prisma.prescription.findUnique({
          where: { id: prescriptionId },
        });
        if (!existingPresc) {
          const prescription = await prisma.prescription.create({
            data: {
              id: prescriptionId,
              patientId: patient.id,
              doctorId: doctor.id,
              appointmentId: appointment.id,
              diagnosis: 'Common Cold',
              status: 'APPROVED',
            },
          });

          await prisma.prescriptionMedication.create({
            data: {
              prescriptionId: prescription.id,
              medicationName: baseMeds[i % baseMeds.length],
              dosage: '1 tablet',
              frequency: 'Twice a day',
              duration: '5 days',
            },
          });
        }
      }
    }
  }

  console.log('📦 Seeding additional Orders & Payments...');
  for (let i = 0; i < 150; i++) {
    const orderId = `d0000000-0000-0000-0000-00000000${i.toString().padStart(4, '0')}`;
    const orderNumber = `ORD-F-${i.toString().padStart(4, '0')}`;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!existingOrder) {
      const patient = fakerPatients[i % fakerPatients.length];
      const branchIndex = i % fakerBranches.length;
      const branch = fakerBranches[branchIndex];

      // Find faker medications seeded for this specific branch
      const pharmacyIndex = Math.floor(branchIndex / 2);
      const branchSubIndex = branchIndex % 2;
      const medId = `90000000-0000-0000-0000-00000000${pharmacyIndex}${branchSubIndex}00`; // pick first med of the branch

      const med = await prisma.medication.findUnique({ where: { id: medId } });
      if (med) {
        const total = med.price;
        const status =
          i % 4 === 0
            ? OrderStatus.PENDING
            : i % 4 === 1
              ? OrderStatus.COMPLETED
              : i % 4 === 2
                ? OrderStatus.DELIVERED
                : OrderStatus.CANCELLED;
        const type = i % 2 === 0 ? OrderType.DELIVERY : OrderType.PICKUP;

        const order = await prisma.order.create({
          data: {
            id: orderId,
            orderNumber,
            patientId: patient.id,
            pharmacyId: branch.pharmacyId,
            branchId: branch.id,
            total: total,
            status: status,
            type: type,
            paymentMethod: PaymentMethod.MTN_MOMO,
            subtotal: total,
            deliveryFee: 1500,
          },
        });

        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            medicationId: med.id,
            quantity: 1,
            price: med.price,
          },
        });

        if (
          status === OrderStatus.COMPLETED ||
          status === OrderStatus.DELIVERED
        ) {
          await prisma.payment.create({
            data: {
              orderId: order.id,
              amount: total + 1500,
              paymentMethod: PaymentMethod.MTN_MOMO,
              status: PaymentStatus.COMPLETED,
              transactionId: `TXN-F-${i.toString().padStart(4, '0')}`,
            },
          });
        }
      }
    }
  }

  // Stock Transfer
  console.log('🔄 Seeding additional Stock Transfers...');
  const transferId = 'transfer-seed-record-faker';
  const existingTransfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
  });
  if (!existingTransfer && fakerBranches.length >= 2) {
    const transfer = await prisma.stockTransfer.create({
      data: {
        id: transferId,
        fromBranchId: fakerBranches[0].id,
        toBranchId: fakerBranches[1].id,
        status: 'COMPLETED',
      },
    });

    const medId = `90000000-0000-0000-0000-000000000000`; // pharmacy 0 branch 0 first med
    await prisma.stockTransferItem.create({
      data: {
        transferId: transfer.id,
        medicationId: medId,
        quantity: 10,
      },
    });
  }

  // Carts
  console.log('🛒 Seeding additional Cart Items...');
  for (let i = 0; i < 10; i++) {
    const patient = fakerPatients[i % fakerPatients.length];
    const pharmacyIndex = i % fakerPharmacies.length;
    const branchSubIndex = 0;
    const medId = `90000000-0000-0000-0000-00000000${pharmacyIndex}${branchSubIndex}01`;

    const med = await prisma.medication.findUnique({ where: { id: medId } });
    if (med) {
      await prisma.cartItem.upsert({
        where: {
          patientId_medicationId: {
            patientId: patient.id,
            medicationId: med.id,
          },
        },
        update: {
          quantity: 2,
        },
        create: {
          patientId: patient.id,
          pharmacyId: med.pharmacyId,
          medicationId: med.id,
          quantity: 2,
        },
      });
    }
  }

  // Notifications
  console.log('🔔 Seeding additional Notifications...');
  for (let i = 0; i < 20; i++) {
    const notificationId = `n0000000-0000-0000-0000-0000000000${i.toString().padStart(2, '0')}`;
    const existingNotif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existingNotif) {
      const patient = fakerPatients[i % fakerPatients.length];
      await prisma.notification.create({
        data: {
          id: notificationId,
          userId: patient.userId,
          type: NotificationType.ORDER_PLACED,
          title: 'New Update',
          message: 'You have a new update regarding your interaction.',
        },
      });
    }
  }

  console.log('\n✅ Seeding complete! Database is successfully synchronized.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function getKigaliCoordinates() {
  return {
    latitude: faker.location.latitude({ max: -1.9, min: -1.97, precision: 4 }),
    longitude: faker.location.longitude({
      max: 30.15,
      min: 30.03,
      precision: 4,
    }),
  };
}

function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let curVal = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuote) {
      if (char === '"') {
        if (i < text.length - 1 && text[i + 1] === '"') {
          curVal += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        curVal += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        result.push(curVal);
        curVal = '';
      } else {
        curVal += char;
      }
    }
  }
  result.push(curVal);
  return result;
}

function parseDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  } catch (e) {
    return new Date();
  }
}

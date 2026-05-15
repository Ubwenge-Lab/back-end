import { PrismaClient, UserRole, PharmacyStatus, BranchStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Test@1234';

// Fixed IDs for Idempotency
const IDS = {
  users: {
    superAdmin: "00000000-0000-0000-0000-000000000001",
    medplusOwner: "00000000-0000-0000-0000-000000000002",
    medplusManager: "00000000-0000-0000-0000-000000000003",
    medplusPharmacist: "00000000-0000-0000-0000-000000000004",
    medplusCashier: "00000000-0000-0000-0000-000000000005",
    ubumweOwner: "00000000-0000-0000-0000-000000000006",
    ubumweManager: "00000000-0000-0000-0000-000000000007",
    remeraOwner: "00000000-0000-0000-0000-000000000008",
    kigaliCentralOwner: "00000000-0000-0000-0000-000000000011",
    alice: "00000000-0000-0000-0000-000000000009",
    bob: "00000000-0000-0000-0000-000000000010",
    claire: "00000000-0000-0000-0000-000000000012",
    david: "00000000-0000-0000-0000-000000000013",
  },
  pharmacies: {
    medplus: "10000000-0000-0000-0000-000000000001",
    ubumwe: "10000000-0000-0000-0000-000000000002",
    remera: "10000000-0000-0000-0000-000000000003",
    kigaliCentral: "10000000-0000-0000-0000-000000000004",
  },
  branches: {
    medplusMain: "20000000-0000-0000-0000-000000000001",
    medplusRemera: "20000000-0000-0000-0000-000000000002",
    ubumweKimironko: "20000000-0000-0000-0000-000000000003",
    kigaliCentralMain: "20000000-0000-0000-0000-000000000004",
  }
};

async function main() {
  console.log('🌱 Starting idempotent seed (Upsert Mode)...\n');

  const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);
  
  // Use .env for Super Admin
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@evuze.rw';
  const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ? await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, HASH_ROUNDS) : password;

  // ==========================================
  // 1. USERS
  // ==========================================
  console.log('👤 Syncing users...');

  const users = [
    { id: IDS.users.superAdmin, email: ADMIN_EMAIL, role: UserRole.SUPER_ADMIN, isVerified: true, pass: ADMIN_PASSWORD },
    { id: IDS.users.medplusOwner, email: 'owner@medplus.com', role: UserRole.PHARMACY, isVerified: true, pass: password },
    { id: IDS.users.medplusManager, email: 'manager@medplus.com', role: UserRole.BRANCH_MANAGER, isVerified: true, pass: password },
    { id: IDS.users.medplusPharmacist, email: 'pharmacist@medplus.com', role: UserRole.PHARMACIST, isVerified: true, pass: password },
    { id: IDS.users.medplusCashier, email: 'cashier@medplus.com', role: UserRole.CASHIER, isVerified: true, pass: password },
    { id: IDS.users.ubumweOwner, email: 'owner@ubumwepharma.com', role: UserRole.PHARMACY, isVerified: true, pass: password },
    { id: IDS.users.ubumweManager, email: 'manager@ubumwepharma.com', role: UserRole.BRANCH_MANAGER, isVerified: true, pass: password },
    { id: IDS.users.remeraOwner, email: 'owner@remerahealth.com', role: UserRole.PHARMACY, isVerified: true, pass: password },
    { id: IDS.users.kigaliCentralOwner, email: 'owner@kigalicentralpharma.com', role: UserRole.PHARMACY, isVerified: true, pass: password },
    { id: IDS.users.alice, email: 'alice@patient.com', role: UserRole.PATIENT, isVerified: true, pass: password },
    { id: IDS.users.bob, email: 'bob@patient.com', role: UserRole.PATIENT, isVerified: true, pass: password },
    { id: IDS.users.claire, email: 'claire@patient.com', role: UserRole.PATIENT, isVerified: true, pass: password },
    { id: IDS.users.david, email: 'david@patient.com', role: UserRole.PATIENT, isVerified: true, pass: password },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, isVerified: u.isVerified, isActive: true },
      create: { id: u.id, email: u.email, role: u.role, isVerified: u.isVerified, password: u.pass, isActive: true },
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
      latitude: -1.9500,
      longitude: 30.0588,
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
      dateOfIncorporation: new Date('2023-08-05'),
      rdbCertificate: 'RDB-2023-009988',
      pharmacyLicense: 'LIC-2023-PH-099',
      status: PharmacyStatus.PENDING,
    }
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
      latitude: -1.9500,
      longitude: 30.0588,
      isActive: true,
      branchStatus: BranchStatus.APPROVED,
      branchManagerEmail: 'manager@kigalicentralpharma.com',
    }
  ];

  for (const b of branches) {
    const { pharmacyEmail, managerEmail, ...bData } = b;
    const owner = await prisma.user.findUnique({ where: { email: pharmacyEmail }, include: { pharmacy: true } });
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
    { email: 'alice@patient.com', firstName: 'Alice', lastName: 'Mukamana', address: 'KG 7 Ave, Kimironko, Gasabo, Kigali', insuranceProvider: 'RSSB', coverage: 80 },
    { email: 'bob@patient.com', firstName: 'Bob', lastName: 'Habimana', address: 'KN 4 Ave, Nyarugenge, Kigali', insuranceProvider: null, coverage: 0 },
    { email: 'claire@patient.com', firstName: 'Claire', lastName: 'Ingabire', address: 'KG 12 Ave, Remera, Gasabo, Kigali', insuranceProvider: 'MMI', coverage: 60 },
    { email: 'david@patient.com', firstName: 'David', lastName: 'Nshuti', address: 'Kicukiro District, Kigali, Rwanda', insuranceProvider: null, coverage: 0 },
  ];

  for (const p of patients) {
    const userId = await getUserId(p.email);
    if (!userId) continue;

    await prisma.patient.upsert({
      where: { userId },
      update: { firstName: p.firstName, lastName: p.lastName, address: p.address },
      create: {
        user: { connect: { id: userId } },
        firstName: p.firstName,
        lastName: p.lastName,
        phone: '+250788' + Math.floor(Math.random() * 9000000 + 1000000),
        address: p.address,
        mrn: `MRN-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
        insuranceProvider: p.insuranceProvider,
        insuranceCoverage: p.coverage,
      }
    });
  }

  const pharmId = await getUserId('pharmacist@medplus.com');
  const medPlusMain = await prisma.branch.findFirst({ where: { name: 'MedPlus Main Branch' } });

  if (pharmId && medPlusMain) {
    await prisma.staff.upsert({
      where: { userId: pharmId },
      update: { firstName: 'Samuel', status: 'ACTIVE' },
      create: {
        userId: pharmId,
        branchId: medPlusMain.id,
        firstName: 'Samuel',
        lastName: 'Nkurunziza',
        phone: '+250788100001',
        status: 'ACTIVE',
      }
    });
  }

  const cashierId = await getUserId('cashier@medplus.com');
  if (cashierId && medPlusMain) {
    await prisma.staff.upsert({
      where: { userId: cashierId },
      update: { firstName: 'Grace', status: 'ACTIVE' },
      create: {
        userId: cashierId,
        branchId: medPlusMain.id,
        firstName: 'Grace',
        lastName: 'Uwimana',
        phone: '+250788100002',
        status: 'ACTIVE',
      }
    });
  }

  // ==========================================
  // 5. MEDICATIONS & ORDERS
  // ==========================================
  console.log('🛒 Syncing medications & orders...');

  const medId = "30000000-0000-0000-0000-000000000001";
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
      }
    });

    const aliceP = await prisma.patient.findFirst({ where: { firstName: 'Alice' } });
    const bobP = await prisma.patient.findFirst({ where: { firstName: 'Bob' } });

    if (aliceP && bobP) {
      const orders = [
        { orderNumber: 'ORD-2026-0001', patientId: aliceP.id, status: 'COMPLETED', paymentMethod: 'MTN_MOMO', paymentStatus: 'COMPLETED', patientPayment: 1200 },
        { orderNumber: 'ORD-2026-0002', patientId: bobP.id, status: 'PENDING', paymentMethod: 'CARD', paymentStatus: 'PENDING', patientPayment: 5600 },
        { orderNumber: 'ORD-2026-0003', patientId: aliceP.id, status: 'ACCEPTED', paymentMethod: 'CARD', paymentStatus: 'PENDING', patientPayment: 11000 },
        { orderNumber: 'ORD-2026-0004', patientId: aliceP.id, status: 'READY_FOR_PICKUP', paymentMethod: 'MTN_MOMO', paymentStatus: 'COMPLETED', patientPayment: 1600 },
        { orderNumber: 'ORD-2026-0005', patientId: bobP.id, status: 'READY_FOR_PICKUP', paymentMethod: 'CASH', paymentStatus: 'PENDING', patientPayment: 4500 },
        { orderNumber: 'ORD-2026-0006', patientId: bobP.id, status: 'PREPARING', paymentMethod: 'CARD', paymentStatus: 'PENDING', patientPayment: 11000 },
      ];

      for (const o of orders) {
        await prisma.order.upsert({
          where: { orderNumber: o.orderNumber },
          update: { status: o.status as any, paymentMethod: o.paymentMethod as any },
          create: {
            ...o as any,
            pharmacyId: medPlusMain.pharmacyId,
            branchId: medPlusMain.id,
            type: 'PICKUP',
            subtotal: 5000,
            total: 5000,
            orderItems: { create: [{ medicationId: medId, quantity: 1, price: 2500 }] }
          }
        });
      }
    }
  }

  // ==========================================
  // 6. ATTENDANCE & MISC
  // ==========================================
  console.log('🕐 Syncing attendance & misc...');

  const staffG = await prisma.staff.findFirst({ where: { firstName: 'Grace' } });
  if (staffG && medPlusMain) {
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    
    await prisma.attendance.upsert({
      where: { id: "40000000-0000-0000-0000-000000000001" },
      update: { status: 'COMPLETED' },
      create: {
        id: "40000000-0000-0000-0000-000000000001",
        staffId: staffG.id,
        branchId: medPlusMain.id,
        clockInTime: today,
        status: 'COMPLETED',
        clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 10 },
      }
    });
  }

  console.log('\n✅ Nelly\'s branch conflict resolved and updated with Dev branch!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

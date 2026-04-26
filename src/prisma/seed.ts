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

  // ==========================================
  // 1. USERS
  // ==========================================
  console.log('👤 Syncing users...');

  const users = [
    { id: IDS.users.superAdmin, email: 'superadmin@pharma.com', role: UserRole.SUPER_ADMIN, isVerified: true },
    { id: IDS.users.medplusOwner, email: 'owner@medplus.com', role: UserRole.PHARMACY, isVerified: true },
    { id: IDS.users.medplusManager, email: 'manager@medplus.com', role: UserRole.BRANCH_MANAGER, isVerified: true },
    { id: IDS.users.medplusPharmacist, email: 'pharmacist@medplus.com', role: UserRole.PHARMACIST, isVerified: true },
    { id: IDS.users.medplusCashier, email: 'cashier@medplus.com', role: UserRole.CASHIER, isVerified: true },
    { id: IDS.users.ubumweOwner, email: 'owner@ubumwepharma.com', role: UserRole.PHARMACY, isVerified: true },
    { id: IDS.users.ubumweManager, email: 'manager@ubumwepharma.com', role: UserRole.BRANCH_MANAGER, isVerified: true },
    { id: IDS.users.remeraOwner, email: 'owner@remerahealth.com', role: UserRole.PHARMACY, isVerified: true },
    { id: IDS.users.kigaliCentralOwner, email: 'owner@kigalicentralpharma.com', role: UserRole.PHARMACY, isVerified: true },
    { id: IDS.users.alice, email: 'alice@patient.com', role: UserRole.PATIENT, isVerified: true },
    { id: IDS.users.bob, email: 'bob@patient.com', role: UserRole.PATIENT, isVerified: true },
    { id: IDS.users.claire, email: 'claire@patient.com', role: UserRole.PATIENT, isVerified: true },
    { id: IDS.users.david, email: 'david@patient.com', role: UserRole.PATIENT, isVerified: true },
  ];

  for (const u of users) {
    const { id, email, role, isVerified } = u;
    await prisma.user.upsert({
      where: { email },
      update: { role, isVerified, isActive: true },
      create: { id, email, role, isVerified, password, isActive: true },
    });
  }

  // Get actual IDs from DB (since users might have existed with different IDs)
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
    
    // Find pharmacy by user email
    const owner = await prisma.user.findUnique({ where: { email: pharmacyEmail }, include: { pharmacy: true } });
    const pharmacyId = owner?.pharmacy?.id;
    if (!pharmacyId) continue;

    // Find manager if provided
    let managerId = null;
    if (managerEmail) {
      managerId = (await getUserId(managerEmail)) || null;
    }

    const { id, ...updateData } = bData;

    // Upsert logic: use managerId if unique, otherwise fall back to ID
    const whereClause = managerId ? { managerId } : { id: b.id };

    await prisma.branch.upsert({
      where: whereClause as any,
      update: { ...updateData, pharmacyId, managerId },
      create: { ...bData, id: b.id, pharmacyId, managerId },
    });
  }

  // ==========================================
  // 4. PATIENTS & STAFF (Representative records)
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
        userId,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: '+250788' + Math.floor(Math.random() * 9000000 + 1000000),
        address: p.address,
        insuranceProvider: p.insuranceProvider,
        insuranceCoverage: p.coverage,
      }
    });
  }

  const pharmId = await getUserId('pharmacist@medplus.com');
  if (pharmId) {
    const medPlusMain = await prisma.branch.findFirst({ where: { name: 'MedPlus Main Branch' } });
    await prisma.staff.upsert({
      where: { userId: pharmId },
      update: { firstName: 'Samuel', status: 'ACTIVE' },
      create: {
        userId: pharmId,
        branchId: medPlusMain?.id || IDS.branches.medplusMain,
        firstName: 'Samuel',
        lastName: 'Nkurunziza',
        phone: '+250788100001',
        status: 'ACTIVE',
      }
    });
  }

  const cashierId = await getUserId('cashier@medplus.com');
  if (cashierId) {
    const medPlusMain = await prisma.branch.findFirst({ where: { name: 'MedPlus Main Branch' } });
    await prisma.staff.upsert({
      where: { userId: cashierId },
      update: { firstName: 'Grace', status: 'ACTIVE' },
      create: {
        userId: cashierId,
        branchId: medPlusMain?.id || IDS.branches.medplusMain,
        firstName: 'Grace',
        lastName: 'Uwimana',
        phone: '+250788100002',
        status: 'ACTIVE',
      }
    });
  }

  // ==========================================
  // 5. TEST ORDERS (Nelly's Data)
  // ==========================================
  console.log('🛒 Syncing test orders...');

  const patientAlice = await prisma.user.findUnique({ where: { email: 'alice@patient.com' }, include: { patient: true } });
  const patientId = patientAlice?.patient?.id;
  if (!patientId) {
    console.warn('⚠️ Alice patient record not found, skipping orders.');
  } else {
    // Create a few medications first for the orders
    const medPlusOwner = await prisma.user.findUnique({ where: { email: 'owner@medplus.com' }, include: { pharmacy: true } });
    const pharmacyId = medPlusOwner?.pharmacy?.id;
    const medPlusMain = await prisma.branch.findFirst({ where: { name: 'MedPlus Main Branch' } });
    const branchId = medPlusMain?.id;

    if (!pharmacyId || !branchId) {
      console.warn('⚠️ MedPlus Main Branch not found, skipping medications.');
    } else {
      const amoxicillin = await prisma.medication.upsert({
        where: { id: "30000000-0000-0000-0000-000000000001" },
        update: { quantity: 200 },
        create: {
          id: "30000000-0000-0000-0000-000000000001",
          pharmacyId,
          branchId,
          name: 'Amoxicillin 500mg',
          category: 'Antibiotics',
          price: 2500,
          quantity: 200,
        }
      });

      const orders = [
        {
          orderNumber: 'ORD-2026-0001',
          patientId,
          pharmacyId,
          branchId,
          type: 'DELIVERY',
          status: 'COMPLETED',
          subtotal: 5000,
          total: 6000,
          paymentMethod: 'MTN_MOMO',
          paymentStatus: 'COMPLETED',
          patientPayment: 1200,
        },
        {
          orderNumber: 'ORD-2026-0005',
          patientId: (await prisma.user.findUnique({ where: { email: 'bob@patient.com' }, include: { patient: true } }))?.patient?.id,
          pharmacyId,
          branchId,
          type: 'PICKUP',
          status: 'READY_FOR_PICKUP',
          subtotal: 4500,
          total: 4500,
          paymentMethod: 'CASH',
          paymentStatus: 'PENDING',
          patientPayment: 4500,
        }
      ];

      for (const o of orders) {
        if (!o.patientId) continue;
        
        const { orderNumber, ...orderData } = o;
        
        await prisma.order.upsert({
          where: { orderNumber },
          update: { 
            paymentMethod: o.paymentMethod as any,
            status: o.status as any,
            paymentStatus: o.paymentStatus as any 
          },
          create: {
            orderNumber,
            ...orderData as any,
            orderItems: {
              create: [
                { medicationId: amoxicillin.id, quantity: 2, price: 2500 }
              ]
            }
          }
        });
      }
    }
  }

  console.log('\n✅ Idempotent Seed Completed Successfully!');
  console.log('📌 Database is now in sync with latest branch requirements.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

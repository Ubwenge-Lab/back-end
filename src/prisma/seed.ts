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
  console.log('🌱 Starting full seed...\n');

  await clearDatabase();

  const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  // ==========================================
  // 1. USERS
  // ==========================================
  console.log('👤 Creating users...');

  const superAdminUser = await prisma.user.create({
    data: {
      email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@pharma.com',
      password: await bcrypt.hash(
        process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminPower@2025',
        HASH_ROUNDS,
      ),
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });

  // --- Pharmacy 1: MedPlus (KN 5 Ave, Nyarugenge) ---
  const pharmacyUser1 = await prisma.user.create({
    data: { email: 'owner@medplus.com', password, role: 'PHARMACY', isVerified: true },
  });
  const branchManagerUser1 = await prisma.user.create({
    data: { email: 'manager@medplus.com', password, role: 'BRANCH_MANAGER', isVerified: true },
  });
  const pharmacistUser = await prisma.user.create({
    data: { email: 'pharmacist@medplus.com', password, role: 'PHARMACIST', isVerified: true },
  });
  const cashierUser = await prisma.user.create({
    data: { email: 'cashier@medplus.com', password, role: 'CASHIER', isVerified: true },
  });

  // --- Pharmacy 2: Ubumwe Pharmacy (Kimironko, Gasabo) ---
  const pharmacyUser2 = await prisma.user.create({
    data: { email: 'owner@ubumwepharma.com', password, role: 'PHARMACY', isVerified: true },
  });
  const branchManagerUser2 = await prisma.user.create({
    data: { email: 'manager@ubumwepharma.com', password, role: 'BRANCH_MANAGER', isVerified: true },
  });

  // --- Pharmacy 3: Kigali Central Pharmacy (City Centre) ---
  const pharmacyUser3 = await prisma.user.create({
    data: { email: 'owner@kigalicentralpharma.com', password, role: 'PHARMACY', isVerified: true },
  });

  // --- Pharmacy 4: Remera Health Pharmacy (Remera, pending approval) ---
  const pharmacyUser4 = await prisma.user.create({
    data: { email: 'owner@remerahealth.com', password, role: 'PHARMACY', isVerified: true },
  });

  // --- Patients ---
  const patient1User = await prisma.user.create({
    data: { email: 'alice@patient.com', password, role: 'PATIENT', isVerified: true },
  });
  const patient2User = await prisma.user.create({
    data: { email: 'bob@patient.com', password, role: 'PATIENT', isVerified: true },
  });
  const patient3User = await prisma.user.create({
    data: { email: 'claire@patient.com', password, role: 'PATIENT', isVerified: true },
  });
  const patient4User = await prisma.user.create({
    data: { email: 'david@patient.com', password, role: 'PATIENT', isVerified: true },
  });

  console.log('✅ Users created.\n');

  // ==========================================
  // 2. PHARMACIES (Real Kigali GPS coordinates)
  // ==========================================
  console.log('🏥 Creating pharmacies...');

  // Pharmacy 1: MedPlus — KN 5 Ave, Nyarugenge (near Kigali Convention Centre)
  // Real coordinates: ~-1.9441, 30.0619
  const pharmacy1 = await prisma.pharmacy.create({
    data: {
      userId: pharmacyUser1.id,
      name: 'MedPlus Pharmacy',
      representativeName: 'Dr. Jean Damascene',
      phone: '+250788000001',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
      latitude: -1.9441,
      longitude: 30.0619,
      dateOfIncorporation: new Date('2018-03-15'),
      rdbCertificate: 'RDB-2018-001234',
      pharmacyLicense: 'LIC-2018-PH-001',
      businessRegistration: 'BRN-2018-567890',
      deliveryZones: ['Nyarugenge', 'Kigali City Centre', 'Muhima'],
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

  // Pharmacy 2: Ubumwe Pharmacy — Kimironko Sector, Gasabo District
  // Real coordinates: Kimironko market area ~-1.9412, 30.1092
  const pharmacy2 = await prisma.pharmacy.create({
    data: {
      userId: pharmacyUser2.id,
      name: 'Ubumwe Pharmacy',
      representativeName: 'Uwimana Marie Claire',
      phone: '+250788000002',
      address: 'KG 11 Ave, Kimironko, Gasabo, Kigali',
      latitude: -1.9412,
      longitude: 30.1092,
      dateOfIncorporation: new Date('2019-06-20'),
      rdbCertificate: 'RDB-2019-004521',
      pharmacyLicense: 'LIC-2019-PH-022',
      businessRegistration: 'BRN-2019-112233',
      deliveryZones: ['Kimironko', 'Remera', 'Gisozi', 'Gasabo'],
      operatingHours: {
        monday: { open: '07:30', close: '21:00' },
        tuesday: { open: '07:30', close: '21:00' },
        wednesday: { open: '07:30', close: '21:00' },
        thursday: { open: '07:30', close: '21:00' },
        friday: { open: '07:30', close: '21:00' },
        saturday: { open: '08:00', close: '19:00' },
        sunday: { open: '09:00', close: '17:00' },
      },
      status: 'APPROVED',
      approvedAt: new Date('2019-07-10'),
    },
  });

  // Pharmacy 3: Kigali Central Pharmacy — City Centre near Centenary House
  // Real coordinates: ~-1.9500, 30.0588
  const pharmacy3 = await prisma.pharmacy.create({
    data: {
      userId: pharmacyUser3.id,
      name: 'Kigali Central Pharmacy',
      representativeName: 'Nkurunziza Emmanuel',
      phone: '+250788000003',
      address: 'KN 3 Rd, City Centre, Nyarugenge, Kigali',
      latitude: -1.9500,
      longitude: 30.0588,
      dateOfIncorporation: new Date('2015-01-10'),
      rdbCertificate: 'RDB-2015-000789',
      pharmacyLicense: 'LIC-2015-PH-007',
      businessRegistration: 'BRN-2015-321654',
      deliveryZones: ['City Centre', 'Nyarugenge', 'Biryogo'],
      operatingHours: {
        monday: { open: '08:00', close: '22:00' },
        tuesday: { open: '08:00', close: '22:00' },
        wednesday: { open: '08:00', close: '22:00' },
        thursday: { open: '08:00', close: '22:00' },
        friday: { open: '08:00', close: '22:00' },
        saturday: { open: '08:00', close: '20:00' },
        sunday: { open: '10:00', close: '18:00' },
      },
      status: 'APPROVED',
      approvedAt: new Date('2015-02-01'),
    },
  });

  // Pharmacy 4: Remera Health Pharmacy — Remera, near Sonatubes Roundabout
  // Real coordinates: ~-1.9559, 30.1125 (PENDING — for super-admin location check testing)
  const pharmacy4 = await prisma.pharmacy.create({
    data: {
      userId: pharmacyUser4.id,
      name: 'Remera Health Pharmacy',
      representativeName: 'Habimana Patrick',
      phone: '+250788000004',
      address: 'KG 9 Ave, Remera, Gasabo, Kigali',
      latitude: -1.9559,
      longitude: 30.1125,
      dateOfIncorporation: new Date('2023-08-05'),
      rdbCertificate: 'RDB-2023-009988',
      pharmacyLicense: 'LIC-2023-PH-099',
      businessRegistration: 'BRN-2023-778899',
      deliveryZones: ['Remera', 'Nyarutarama', 'Kibagabaga'],
      operatingHours: {
        monday: { open: '08:00', close: '20:00' },
        tuesday: { open: '08:00', close: '20:00' },
        wednesday: { open: '08:00', close: '20:00' },
        thursday: { open: '08:00', close: '20:00' },
        friday: { open: '08:00', close: '20:00' },
        saturday: { open: '09:00', close: '17:00' },
      },
      status: 'PENDING', // Awaiting super-admin approval — good for location verification testing
    },
  });

  console.log('✅ Pharmacies created.\n');

  // ==========================================
  // 3. BRANCHES
  // ==========================================
  console.log('🏪 Creating branches...');

  // MedPlus — Main branch (same location as pharmacy)
  const mainBranch = await prisma.branch.create({
    data: {
      pharmacyId: pharmacy1.id,
      managerId: branchManagerUser1.id,
      name: 'MedPlus Main Branch',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
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

  // MedPlus — Remera branch
  const remeraB1 = await prisma.branch.create({
    data: {
      pharmacyId: pharmacy1.id,
      name: 'MedPlus Remera Branch',
      address: 'KG 9 Ave, Remera, Gasabo, Kigali',
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

  // Ubumwe — Main branch (Kimironko)
  const ubumweBranch = await prisma.branch.create({
    data: {
      pharmacyId: pharmacy2.id,
      managerId: branchManagerUser2.id,
      name: 'Ubumwe Kimironko Branch',
      address: 'KG 11 Ave, Kimironko, Gasabo, Kigali',
      phone: '+250788000030',
      latitude: -1.9412,
      longitude: 30.1092,
      isActive: true,
      branchStatus: 'APPROVED',
      branchManagerEmail: 'manager@ubumwepharma.com',
      operatingHours: {
        monday: { open: '07:30', close: '21:00' },
        tuesday: { open: '07:30', close: '21:00' },
        wednesday: { open: '07:30', close: '21:00' },
        thursday: { open: '07:30', close: '21:00' },
        friday: { open: '07:30', close: '21:00' },
        saturday: { open: '08:00', close: '19:00' },
      },
    },
  });

  // Kigali Central — Main branch
  const centralBranch = await prisma.branch.create({
    data: {
      pharmacyId: pharmacy3.id,
      name: 'Kigali Central Main Branch',
      address: 'KN 3 Rd, City Centre, Kigali',
      phone: '+250788000040',
      latitude: -1.9500,
      longitude: 30.0588,
      isActive: true,
      branchStatus: 'APPROVED',
      branchManagerEmail: 'central.manager@kigalicentralpharma.com',
      operatingHours: {
        monday: { open: '08:00', close: '22:00' },
        tuesday: { open: '08:00', close: '22:00' },
        wednesday: { open: '08:00', close: '22:00' },
        thursday: { open: '08:00', close: '22:00' },
        friday: { open: '08:00', close: '22:00' },
        saturday: { open: '08:00', close: '20:00' },
        sunday: { open: '10:00', close: '18:00' },
      },
    },
  });

  console.log('✅ Branches created.\n');

  // ==========================================
  // 4. STAFF
  // ==========================================
  console.log('👨‍⚕️ Creating staff...');

  const pharmacistStaff = await prisma.staff.create({
    data: {
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
            'VIEW_ORDERS', 'ACCEPT_ORDERS', 'UPDATE_ORDER_STATUS',
            'VIEW_INVENTORY', 'ADD_MEDICATION', 'EDIT_MEDICATION',
            'VIEW_PRESCRIPTIONS', 'APPROVE_PRESCRIPTIONS', 'REJECT_PRESCRIPTIONS',
            'VIEW_CUSTOMERS', 'VIEW_ANALYTICS',
          ],
        },
      },
    },
  });

  const cashierStaff = await prisma.staff.create({
    data: {
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
            'VIEW_ORDERS', 'VIEW_INVENTORY',
            'VIEW_PAYMENTS', 'PROCESS_PAYMENTS', 'VIEW_CUSTOMERS',
          ],
        },
      },
    },
  });

  console.log('✅ Staff created.\n');

  // ==========================================
  // 5. PATIENTS (Realistic Kigali coordinates)
  // ==========================================
  console.log('🧑‍🤝‍🧑 Creating patients...');

  // Alice — Gasabo District, near Kimironko (~800m from Ubumwe Pharmacy)
  // Coordinates: -1.9380, 30.1050
  const patient1 = await prisma.patient.create({
    data: {
      userId: patient1User.id,
      firstName: 'Alice',
      lastName: 'Mukamana',
      phone: '+250788200001',
      dateOfBirth: new Date('1992-03-10'),
      gender: 'Female',
      address: 'KG 7 Ave, Kimironko, Gasabo, Kigali',
      nationalId: '1199280000111222',
      insuranceProvider: 'RSSB',
      insurancePolicy: 'RSSB-2024-001',
      insuranceMemberId: 'MBR-001122',
      insuranceCoverage: 80,
    },
  });

  // Bob — Nyarugenge District, near City Centre (~500m from Kigali Central Pharmacy)
  // Coordinates: -1.9523, 30.0601
  const patient2 = await prisma.patient.create({
    data: {
      userId: patient2User.id,
      firstName: 'Bob',
      lastName: 'Habimana',
      phone: '+250788200002',
      dateOfBirth: new Date('1988-11-25'),
      gender: 'Male',
      address: 'KN 4 Ave, Nyarugenge, Kigali',
      nationalId: '1198880000333444',
    },
  });

  // Claire — Remera, close to MedPlus Remera Branch (~400m)
  // Coordinates: -1.9540, 30.1100
  const patient3 = await prisma.patient.create({
    data: {
      userId: patient3User.id,
      firstName: 'Claire',
      lastName: 'Ingabire',
      phone: '+250788200003',
      dateOfBirth: new Date('1996-07-18'),
      gender: 'Female',
      address: 'KG 12 Ave, Remera, Gasabo, Kigali',
      nationalId: '1199680000555666',
      insuranceProvider: 'MMI',
      insurancePolicy: 'MMI-2023-442',
      insuranceMemberId: 'MBR-442200',
      insuranceCoverage: 60,
    },
  });

  // David — Kicukiro, ~2.5km from MedPlus Main Branch
  // Coordinates: -1.9720, 30.0730
  const patient4 = await prisma.patient.create({
    data: {
      userId: patient4User.id,
      firstName: 'David',
      lastName: 'Ntwari',
      phone: '+250788200004',
      dateOfBirth: new Date('1985-02-28'),
      gender: 'Male',
      address: 'KK 15 Ave, Kicukiro, Kigali',
      nationalId: '1198580000777888',
    },
  });

  console.log('✅ Patients created.\n');

  // ==========================================
  // 6. MEDICATIONS (across branches)
  // ==========================================
  console.log('💊 Creating medications...');

  const medications = await Promise.all([
    // MedPlus Main Branch medications
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Amoxicillin 500mg Capsules', chemicalName: 'Amoxicillin trihydrate',
        description: 'Broad-spectrum antibiotic for bacterial infections.',
        category: 'Antibiotics', price: 2500, quantity: 200, lowStockThreshold: 20,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Paracetamol 500mg Tablets', chemicalName: 'Paracetamol (Acetaminophen)',
        description: 'Common pain reliever and fever reducer.',
        category: 'Analgesics', price: 500, quantity: 500, lowStockThreshold: 50,
        requiresPrescription: false,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Metformin 850mg Tablets', chemicalName: 'Metformin hydrochloride',
        description: 'First-line medication for type 2 diabetes management.',
        category: 'Antidiabetics', price: 3500, quantity: 150, lowStockThreshold: 15,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Ibuprofen 400mg Tablets', chemicalName: 'Ibuprofen',
        description: 'NSAID for pain, fever and inflammation.',
        category: 'NSAIDs', price: 800, quantity: 300, lowStockThreshold: 30,
        requiresPrescription: false,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Atorvastatin 20mg Tablets', chemicalName: 'Atorvastatin calcium',
        description: 'Statin to lower cholesterol levels.',
        category: 'Cardiovascular', price: 4500, quantity: 100, lowStockThreshold: 10,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'ORS Sachets', chemicalName: 'Sodium chloride / Potassium chloride / Glucose',
        description: 'Prevent and treat dehydration.',
        category: 'Electrolytes', price: 300, quantity: 600, lowStockThreshold: 60,
        requiresPrescription: false,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Omeprazole 20mg Capsules', chemicalName: 'Omeprazole magnesium',
        description: 'Proton pump inhibitor for GERD and stomach ulcers.',
        category: 'Gastrointestinal', price: 1800, quantity: 8, lowStockThreshold: 10,
        requiresPrescription: false,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: mainBranch.id,
        name: 'Amlodipine 5mg Tablets', chemicalName: 'Amlodipine besylate',
        description: 'Calcium channel blocker for hypertension and chest pain.',
        category: 'Cardiovascular', price: 2000, quantity: 120, lowStockThreshold: 10,
        requiresPrescription: true,
      },
    }),
    // MedPlus Remera Branch
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: remeraB1.id,
        name: 'Amoxicillin 500mg Capsules', chemicalName: 'Amoxicillin trihydrate',
        description: 'Broad-spectrum antibiotic for bacterial infections.',
        category: 'Antibiotics', price: 2500, quantity: 50, lowStockThreshold: 20,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy1.id, branchId: remeraB1.id,
        name: 'Paracetamol 500mg Tablets', chemicalName: 'Paracetamol (Acetaminophen)',
        description: 'Common pain reliever and fever reducer.',
        category: 'Analgesics', price: 500, quantity: 200, lowStockThreshold: 50,
        requiresPrescription: false,
      },
    }),
    // Ubumwe Kimironko Branch
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy2.id, branchId: ubumweBranch.id,
        name: 'Paracetamol 500mg Tablets', chemicalName: 'Paracetamol (Acetaminophen)',
        description: 'Common pain reliever and fever reducer.',
        category: 'Analgesics', price: 500, quantity: 400, lowStockThreshold: 50,
        requiresPrescription: false,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy2.id, branchId: ubumweBranch.id,
        name: 'Coartem (Artemether/Lumefantrine)', chemicalName: 'Artemether 20mg / Lumefantrine 120mg',
        description: 'Antimalarial combination therapy.',
        category: 'Antimalarials', price: 3000, quantity: 180, lowStockThreshold: 20,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy2.id, branchId: ubumweBranch.id,
        name: 'Vitamin C 500mg Tablets', chemicalName: 'Ascorbic acid',
        description: 'Immune system support and antioxidant.',
        category: 'Vitamins & Supplements', price: 600, quantity: 350, lowStockThreshold: 40,
        requiresPrescription: false,
      },
    }),
    // Kigali Central Branch
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy3.id, branchId: centralBranch.id,
        name: 'Metformin 850mg Tablets', chemicalName: 'Metformin hydrochloride',
        description: 'First-line medication for type 2 diabetes management.',
        category: 'Antidiabetics', price: 3500, quantity: 90, lowStockThreshold: 15,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy3.id, branchId: centralBranch.id,
        name: 'Ciprofloxacin 500mg Tablets', chemicalName: 'Ciprofloxacin hydrochloride',
        description: 'Broad-spectrum fluoroquinolone antibiotic.',
        category: 'Antibiotics', price: 3200, quantity: 120, lowStockThreshold: 15,
        requiresPrescription: true,
      },
    }),
    prisma.medication.create({
      data: {
        pharmacyId: pharmacy3.id, branchId: centralBranch.id,
        name: 'Zinc Sulfate 20mg Tablets', chemicalName: 'Zinc sulfate',
        description: 'Zinc supplement for diarrhea treatment in children.',
        category: 'Vitamins & Supplements', price: 400, quantity: 500, lowStockThreshold: 50,
        requiresPrescription: false,
      },
    }),
  ]);

  const [
    amoxicillin, paracetamol, metformin, ibuprofen, atorvastatin, ors, omeprazole, amlodipine,
  ] = medications;

  console.log('✅ Medications created.\n');

  // ==========================================
  // 7. PRESCRIPTIONS
  // ==========================================
  console.log('📋 Creating prescriptions...');

  const approvedPrescription = await prisma.prescription.create({
    data: {
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
            dosage: '500mg', frequency: 'Three times daily', duration: '7 days',
            quantity: 21, matchedMedicationId: amoxicillin.id, available: true,
          },
          {
            medicationName: 'Paracetamol 500mg',
            dosage: '500mg', frequency: 'Twice daily', duration: '5 days',
            quantity: 10, matchedMedicationId: paracetamol.id, available: true,
          },
        ],
      },
    },
  });

  await prisma.prescription.create({
    data: {
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
            dosage: '850mg', frequency: 'Twice daily', duration: '30 days',
            quantity: 60, matchedMedicationId: metformin.id, available: true,
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

  const completedOrder = await prisma.order.create({
    data: {
      patientId: patient1.id,
      pharmacyId: pharmacy1.id,
      branchId: mainBranch.id,
      orderNumber: 'ORD-2026-0001',
      type: 'DELIVERY',
      status: 'COMPLETED',
      deliveryAddress: 'KG 7 Ave, Kimironko, Gasabo, Kigali',
      deliveryFee: 1000,
      deliveryZone: 'Gasabo',
      prescriptionId: approvedPrescription.id,
      subtotal: 57500,
      total: 58500,
      paymentMethod: 'MTN_MOMO',
      paymentStatus: 'COMPLETED',
      insuranceCoverage: 46800,
      patientPayment: 11700,
      orderItems: {
        create: [
          { medicationId: amoxicillin.id, quantity: 21, price: 2500 },
          { medicationId: paracetamol.id, quantity: 10, price: 500 },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
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

  const pendingOrder = await prisma.order.create({
    data: {
      patientId: patient2.id,
      pharmacyId: pharmacy1.id,
      branchId: mainBranch.id,
      orderNumber: 'ORD-2026-0002',
      type: 'PICKUP',
      status: 'PENDING',
      subtotal: 5600,
      total: 5600,
      paymentMethod: 'CARD',
      paymentStatus: 'PENDING',
      patientPayment: 5600,
      orderItems: {
        create: [
          { medicationId: ibuprofen.id, quantity: 4, price: 800 },
          { medicationId: ors.id, quantity: 6, price: 300 },
        ],
      },
    },
  });

  const acceptedOrder = await prisma.order.create({
    data: {
      patientId: patient1.id,
      pharmacyId: pharmacy1.id,
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
          { medicationId: atorvastatin.id, quantity: 2, price: 4500 },
          { medicationId: amlodipine.id, quantity: 1, price: 2000 },
        ],
      },
    },
  });

  console.log('✅ Orders created.\n');

  // ==========================================
  // 9. CART ITEMS
  // ==========================================
  console.log('🛍️ Creating cart items...');

  await prisma.cartItem.createMany({
    data: [
      { patientId: patient2.id, pharmacyId: pharmacy1.id, medicationId: omeprazole.id, quantity: 2 },
      { patientId: patient2.id, pharmacyId: pharmacy1.id, medicationId: paracetamol.id, quantity: 1 },
    ],
  });

  console.log('✅ Cart items created.\n');

  // ==========================================
  // 10. STOCK TRANSFERS
  // ==========================================
  console.log('🔄 Creating stock transfers...');

  await prisma.stockTransfer.create({
    data: {
      fromBranchId: mainBranch.id,
      toBranchId: remeraB1.id,
      status: 'COMPLETED',
      notes: 'Replenishing stock at Remera branch due to high demand.',
      items: {
        create: [
          { medicationId: amoxicillin.id, quantity: 30 },
          { medicationId: paracetamol.id, quantity: 100 },
        ],
      },
    },
  });

  await prisma.stockTransfer.create({
    data: {
      fromBranchId: mainBranch.id,
      toBranchId: remeraB1.id,
      status: 'PENDING',
      notes: 'Monthly restocking transfer.',
      items: {
        create: [{ medicationId: ibuprofen.id, quantity: 50 }],
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
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const clockIn1 = new Date(yesterday); clockIn1.setHours(8, 2, 0, 0);
  const clockOut1 = new Date(yesterday); clockOut1.setHours(17, 5, 0, 0);

  await prisma.attendance.create({
    data: {
      staffId: pharmacistStaff.id, branchId: mainBranch.id,
      clockInTime: clockIn1,
      clockInLocation: { lat: -1.9441, lng: 30.0619, accuracy: 10 },
      clockInApproved: true,
      clockInApprovedAt: new Date(clockIn1.getTime() + 5 * 60000),
      clockInApprovedBy: cashierStaff.id,
      clockOutTime: clockOut1,
      clockOutLocation: { lat: -1.9441, lng: 30.0619, accuracy: 12 },
      clockOutApproved: true,
      clockOutApprovedAt: new Date(clockOut1.getTime() + 3 * 60000),
      clockOutApprovedBy: cashierStaff.id,
      status: 'COMPLETED',
      totalHours: 9.05,
    },
  });

  const clockIn2 = new Date(yesterday); clockIn2.setHours(9, 0, 0, 0);
  const clockOut2 = new Date(yesterday); clockOut2.setHours(18, 10, 0, 0);

  await prisma.attendance.create({
    data: {
      staffId: cashierStaff.id, branchId: mainBranch.id,
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

  const clockIn3 = new Date(today); clockIn3.setHours(8, 5, 0, 0);
  await prisma.attendance.create({
    data: {
      staffId: pharmacistStaff.id, branchId: mainBranch.id,
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
      {
        patientId: patient1.id, orderId: completedOrder.id,
        type: 'ORDER_DELIVERED', title: 'Order Delivered',
        message: 'Your order ORD-2026-0001 has been delivered successfully. Thank you for choosing MedPlus Pharmacy!',
        isRead: true,
      },
      {
        pharmacyId: pharmacy1.id, orderId: pendingOrder.id,
        type: 'ORDER_PLACED', title: 'New Order Received',
        message: 'A new pickup order ORD-2026-0002 has been placed by Bob Habimana.',
        isRead: false,
      },
      {
        patientId: patient1.id,
        type: 'PRESCRIPTION_APPROVED', title: 'Prescription Approved',
        message: 'Your prescription has been reviewed and approved. You can now proceed to order your medications.',
        isRead: false,
      },
      {
        pharmacyId: pharmacy1.id,
        type: 'LOW_STOCK', title: 'Low Stock Alert',
        message: 'Omeprazole 20mg Capsules at MedPlus Main Branch is running low (8 units remaining, threshold: 10).',
        isRead: false,
      },
      {
        patientId: patient1.id, orderId: acceptedOrder.id,
        type: 'ORDER_ACCEPTED', title: 'Order Accepted',
        message: 'Your order ORD-2026-0003 has been accepted and is being processed.',
        isRead: false,
      },
    ],
  });

  console.log('✅ Notifications created.\n');

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('='.repeat(65));
  console.log('🎉 Seed completed successfully!\n');
  console.log('📌 Test Credentials (all passwords: Test@1234)\n');
  console.log('Role              | Email');
  console.log('-'.repeat(60));
  console.log(`SUPER_ADMIN       | ${superAdminUser.email}`);
  console.log(`PHARMACY 1        | ${pharmacyUser1.email}          (MedPlus — APPROVED)`);
  console.log(`PHARMACY 2        | ${pharmacyUser2.email}   (Ubumwe — APPROVED)`);
  console.log(`PHARMACY 3        | ${pharmacyUser3.email} (Kigali Central — APPROVED)`);
  console.log(`PHARMACY 4        | ${pharmacyUser4.email}    (Remera Health — PENDING)`);
  console.log(`BRANCH_MANAGER    | ${branchManagerUser1.email}`);
  console.log(`PHARMACIST        | ${pharmacistUser.email}`);
  console.log(`CASHIER           | ${cashierUser.email}`);
  console.log(`PATIENT (Alice)   | ${patient1User.email}       (Kimironko, -1.9380, 30.1050)`);
  console.log(`PATIENT (Bob)     | ${patient2User.email}         (Nyarugenge, -1.9523, 30.0601)`);
  console.log(`PATIENT (Claire)  | ${patient3User.email}      (Remera, -1.9540, 30.1100)`);
  console.log(`PATIENT (David)   | ${patient4User.email}       (Kicukiro, -1.9720, 30.0730)`);
  console.log('');
  console.log('⚠️  Super admin password:', process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminPower@2025');
  console.log('');
  console.log('🏥 Pharmacies:');
  console.log('   MedPlus             KN 5 Ave, Nyarugenge          -1.9441, 30.0619  APPROVED');
  console.log('   Ubumwe              KG 11 Ave, Kimironko           -1.9412, 30.1092  APPROVED');
  console.log('   Kigali Central      KN 3 Rd, City Centre           -1.9500, 30.0588  APPROVED');
  console.log('   Remera Health       KG 9 Ave, Remera               -1.9559, 30.1125  PENDING');
  console.log('🏪 Branches:    4 branches (3 APPROVED pharmacies + 1 pending)');
  console.log(`💊 Medications: ${medications.length} across all branches`);
  console.log('📋 Prescriptions: 1 APPROVED (Alice), 1 PENDING (Bob)');
  console.log('🛒 Orders:       1 COMPLETED, 1 PENDING, 1 ACCEPTED');
  console.log('🔄 Transfers:    1 COMPLETED, 1 PENDING');
  console.log('🕐 Attendance:   2 COMPLETED (yesterday), 1 PENDING (today)');
  console.log('='.repeat(65));
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

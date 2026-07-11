// src/prisma/seed.ts
import {
  PrismaClient, UserRole, PharmacyStatus, BranchStatus, PaymentMethod,
  PaymentStatus, AppointmentStatus, HospitalBillingStatus, InvoiceStatus,
  OrderStatus, OrderType, StaffStatus, NotificationType, ClaimStatus,
  SupportTicketCategory, SupportTicketStatus, DispenseStatus, SurgeryStatus,
  SurgicalRole, AdmissionStatus, ShiftType, ReferralStatus, DiagnosticType,
  DiagnosticStatus, WardTier, AppointmentType, TransferStatus, AttendanceStatus,
  LeaveStatus
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Test@1234';

// Generates a deterministic, valid v4 UUID based on numeric prefixes
const id = (prefix: number, num: number) => {
  const hexPrefix = prefix.toString(16).padStart(8, '0');
  const hexNum = num.toString(16).padStart(12, '0');
  return `${hexPrefix}-0000-4000-8000-${hexNum}`;
};

async function main() {
  console.log('🌱 Starting Task-Specific Seed: MOH Surveillance & Reporting Data...');
  const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  // ==========================================
  // 1. BASE USERS
  // ==========================================
  const baseUsers = [
    { id: id(1, 1), email: 'super@evuze.rw', role: UserRole.SUPER_ADMIN, first: 'Super', last: 'Admin' },
    { id: id(1, 2), email: 'owner@pharmacy.com', role: UserRole.PHARMACY, first: 'Pharma', last: 'Owner' },
    { id: id(1, 3), email: 'manager@pharmacy.com', role: UserRole.BRANCH_MANAGER, first: 'Branch', last: 'Manager' },
    { id: id(1, 4), email: 'pharmacist@pharmacy.com', role: UserRole.PHARMACIST, first: 'John', last: 'Pharmacist' },
    { id: id(1, 6), email: 'admin@hospital.com', role: UserRole.HOSPITAL_ADMIN, first: 'Hospital', last: 'Admin' },
    { id: id(1, 7), email: 'doctor@hospital.com', role: UserRole.DOCTOR, first: 'Sarah', last: 'Doctor' },
    { id: id(1, 8), email: 'nurse@hospital.com', role: UserRole.NURSE, first: 'Mike', last: 'Nurse' },
    { id: id(1, 9), email: 'tech@hospital.com', role: UserRole.TECHNICIAN, first: 'Alex', last: 'Tech' },
    { id: id(1, 12), email: 'admin2@hospital.com', role: UserRole.HOSPITAL_ADMIN, first: 'Target', last: 'Hospital Admin' },
  ];

  for (const u of baseUsers) {
    await prisma.user.upsert({
      where: { email: u.email }, update: { role: u.role, isActive: true },
      create: { id: u.id, email: u.email, password, role: u.role, isVerified: true, isActive: true, firstName: u.first, lastName: u.last },
    });
  }

  // ==========================================
  // 2. PATIENTS WITH MOH DEMOGRAPHICS
  // ==========================================
  // Mapped specifically to test the Age Group, Gender, and Region aggregations
  const addresses = ['Kigali, Gasabo', 'Kigali, Nyarugenge', 'Kigali, Kicukiro', 'Kigali, Gasabo', 'Kigali, Nyarugenge', 'Kigali, Kicukiro'];
  const genders = ['Male', 'Female', 'Male', 'Female', 'Male', 'Female'];
  const dobs = [
    new Date(Date.now() - 3 * 31536000000),  // ~3 years old (0-4 bucket)
    new Date(Date.now() - 10 * 31536000000), // ~10 years old (5-14 bucket)
    new Date(Date.now() - 30 * 31536000000), // ~30 years old (15-49 bucket)
    new Date(Date.now() - 60 * 31536000000), // ~60 years old (50+ bucket)
    new Date(Date.now() - 25 * 31536000000), // ~25 years old (15-49 bucket)
    new Date(Date.now() - 2 * 31536000000),  // ~2 years old (0-4 bucket)
  ];

  const patients = [];
  for (let i = 1; i <= 6; i++) {
    const pId = id(11, i);
    const uId = id(1, 20 + i);
    await prisma.user.upsert({
      where: { email: `patient${i}@evuze.rw` }, update: {},
      create: { id: uId, email: `patient${i}@evuze.rw`, password, role: UserRole.PATIENT, isVerified: true, isActive: true, firstName: `Test${i}`, lastName: `Patient` }
    });
    const p = await prisma.patient.upsert({
      where: { userId: uId }, update: {},
      create: { 
        id: pId, 
        userId: uId, 
        firstName: `Test${i}`, 
        lastName: 'Patient', 
        phone: `+25078800001${i}`, 
        mrn: `MRN-100${i}`, 
        insuranceProvider: 'RSSB', 
        insuranceCoverage: 80,
        address: addresses[i - 1],
        gender: genders[i - 1],
        dateOfBirth: dobs[i - 1]
      }
    });
    patients.push(p);
  }

  // ==========================================
  // 3. FACILITIES & STAFF
  // ==========================================
  const pharmacy = await prisma.pharmacy.upsert({
    where: { userId: id(1, 2) }, update: {},
    create: { id: id(2, 1), userId: id(1, 2), name: 'Central Pharmacy', phone: '+250788000001', address: 'Kigali', status: PharmacyStatus.APPROVED }
  });

  const branch1 = await prisma.branch.upsert({
    where: { managerId: id(1, 3) }, update: {},
    create: { id: id(3, 1), pharmacyId: pharmacy.id, managerId: id(1, 3), name: 'Main Branch', address: 'Kigali', phone: '+250788000002', status: BranchStatus.APPROVED }
  });

  const hospital1 = await prisma.hospital.upsert({
    where: { userId: id(1, 6) }, update: {},
    create: { id: id(4, 1), userId: id(1, 6), name: 'General Hospital', address: 'Kigali', phone: '+250788000003', status: PharmacyStatus.APPROVED }
  });

  await prisma.hospitalConfig.upsert({
    where: { hospitalId: hospital1.id }, update: {},
    create: { id: id(5, 1), hospitalId: hospital1.id, consultationFee: 15000, triageFee: 5000 }
  });

  const doctor = await prisma.doctor.upsert({
    where: { userId: id(1, 7) }, update: {},
    create: { id: id(12, 1), userId: id(1, 7), hospitalId: hospital1.id, specialization: 'General Medicine', licenseNumber: 'RW-MED-001', firstName: 'Sarah', lastName: 'Doctor' }
  });

  const tech = await prisma.hospitalStaff.upsert({
    where: { userId: id(1, 9) }, update: {},
    create: { id: id(16, 1), userId: id(1, 9), hospitalId: hospital1.id, firstName: 'Alex', lastName: 'Tech', department: 'Laboratory' }
  });

  for (const patient of patients) {
    await prisma.hospitalPatientRegistration.upsert({
      where: { patientId_hospitalId: { patientId: patient.id, hospitalId: hospital1.id } }, update: {},
      create: { id: id(17, parseInt(patient.id.slice(-4), 16)), patientId: patient.id, hospitalId: hospital1.id, mrn: patient.mrn! }
    });
  }

  // ==========================================
  // 4. INVENTORY
  // ==========================================
  const medRegistry = await prisma.medicationRegistry.upsert({
    where: { registrationNumber: 'REG-1001' }, update: {},
    create: { id: id(20, 1), registrationNumber: 'REG-1001', brandName: 'Panadol', genericName: 'Paracetamol', dosageStrength: '500mg', dosageForm: 'Tablet', packSize: '10', packagingType: 'Blister', shelfLife: '24 Months', manufacturerName: 'GSK', manufacturerAddress: 'UK', manufacturerCountry: 'UK', registrationDate: new Date() }
  });

  const med = await prisma.medication.upsert({
    where: { id: id(21, 1) }, update: {},
    create: { id: id(21, 1), pharmacyId: pharmacy.id, branchId: branch1.id, registryId: medRegistry.id, name: 'Panadol 500mg', price: 1000, quantity: 100 }
  });

  // ==========================================
  // 5. DIAGNOSTICS & MOH SURVEILLANCE
  // ==========================================
  console.log('🔬 Seeding Diagnostics & MOH Surveillance Logs...');
  
  // Hardcoded Statutory map values to trigger your listener logic safely
  const statutoryCodes = ['A00', 'A01', 'A09', 'B50', 'B05']; // Cholera, Typhoid, Gastroenteritis, Malaria, Measles
  const diseaseNames = ['Cholera', 'Typhoid and paratyphoid fevers', 'Infectious gastroenteritis', 'Plasmodium falciparum malaria', 'Measles'];

  for (let i = 0; i < 20; i++) {
    const patient = patients[i % patients.length];
    const apptId = id(25, i + 1);

    const appt = await prisma.appointment.upsert({
      where: { id: apptId }, update: { status: AppointmentStatus.COMPLETED },
      create: { id: apptId, patientId: patient.id, doctorId: doctor.id, hospitalId: hospital1.id, date: new Date(), status: AppointmentStatus.COMPLETED, type: AppointmentType.IN_PERSON, reason: `Consultation ${i}` }
    });

    // Make 15 of these diagnostics statutory to populate the MOH report nicely
    const isStatutory = i < 15;
    const dStatus = isStatutory ? DiagnosticStatus.COMPLETED : DiagnosticStatus.PENDING;
    const icd10 = isStatutory ? statutoryCodes[i % statutoryCodes.length] : 'R10.9';
    const diseaseCat = isStatutory ? diseaseNames[i % diseaseNames.length] : null;

    const diagOrder = await prisma.diagnosticOrder.upsert({
      where: { id: id(28, i + 1) }, update: { status: dStatus },
      create: { id: id(28, i + 1), patientId: patient.id, doctorId: doctor.id, appointmentId: appt.id, technicianId: tech.id, testType: DiagnosticType.BLOOD, icd10Code: icd10, status: dStatus, resultValue: isStatutory ? 'Positive' : null }
    });

    // Seed the Surveillance Log natively for the export task
    if (isStatutory) {
      await prisma.mohSurveillanceLog.upsert({
        where: { diagnosticOrderId: diagOrder.id }, update: {},
        create: {
          id: id(62, i + 1),
          patientId: patient.id,
          diagnosticOrderId: diagOrder.id,
          icd10Code: icd10,
          diseaseCategory: diseaseCat!,
          // Distribute the reported dates over the last 7 days for the weekly report aggregation
          reportedAt: new Date(Date.now() - (i % 7) * 86400000), 
        }
      });
    }
  }

  console.log('\n✅ Seed complete! Your database is ready to test the MOH weekly surveillance report export.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
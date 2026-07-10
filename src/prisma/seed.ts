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
  console.log('🌱 Starting Gateway Matrix Seed: Chat & Notifications Coverage...');
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

  // Generate 5 Patients
  const patients = [];
  for (let i = 1; i <= 5; i++) {
    const pId = id(11, i);
    const uId = id(1, 20 + i);
    await prisma.user.upsert({
      where: { email: `patient${i}@evuze.rw` }, update: {},
      create: { id: uId, email: `patient${i}@evuze.rw`, password, role: UserRole.PATIENT, isVerified: true, isActive: true, firstName: `Test${i}`, lastName: `Patient` }
    });
    const p = await prisma.patient.upsert({
      where: { userId: uId }, update: {},
      create: { id: pId, userId: uId, firstName: `Test${i}`, lastName: 'Patient', phone: `+25078800001${i}`, mrn: `MRN-100${i}`, insuranceProvider: 'RSSB', insuranceCoverage: 80 }
    });
    patients.push(p);
  }

  // ==========================================
  // 2. FACILITIES (Pharmacies, Hospitals, Wards)
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

  const ward = await prisma.ward.upsert({
    where: { id: id(6, 1) }, update: {},
    create: { id: id(6, 1), hospitalId: hospital1.id, name: 'General Recovery', tier: WardTier.GENERAL, baseBedCharge: 20000 }
  });

  const bed = await prisma.bed.upsert({
    where: { id: id(7, 1) }, update: {},
    create: { id: id(7, 1), wardId: ward.id, number: 'A-01' }
  });

  const theater = await prisma.operatingTheater.upsert({
    where: { hospitalId_roomNumber: { hospitalId: hospital1.id, roomNumber: 'OT-1' } }, update: {},
    create: { id: id(8, 1), hospitalId: hospital1.id, name: 'Main Surgery', roomNumber: 'OT-1' }
  });

  // ==========================================
  // 3. PERSONNEL & ADMIN DATA
  // ==========================================
  const doctor = await prisma.doctor.upsert({
    where: { userId: id(1, 7) }, update: {},
    create: { id: id(12, 1), userId: id(1, 7), hospitalId: hospital1.id, specialization: 'General Surgery', licenseNumber: 'RW-MED-001', firstName: 'Sarah', lastName: 'Doctor' }
  });

  const nurse = await prisma.hospitalStaff.upsert({
    where: { userId: id(1, 8) }, update: {},
    create: { id: id(15, 1), userId: id(1, 8), hospitalId: hospital1.id, firstName: 'Mike', lastName: 'Nurse', department: 'Ward' }
  });

  for (const patient of patients) {
    await prisma.hospitalPatientRegistration.upsert({
      where: { patientId_hospitalId: { patientId: patient.id, hospitalId: hospital1.id } }, update: {},
      create: { id: id(17, parseInt(patient.id.slice(-4), 16)), patientId: patient.id, hospitalId: hospital1.id, mrn: patient.mrn! }
    });
  }

  // ==========================================
  // 4. INVENTORY & STOCK
  // ==========================================
  const medRegistry = await prisma.medicationRegistry.upsert({
    where: { registrationNumber: 'REG-1001' }, update: {},
    create: { id: id(20, 1), registrationNumber: 'REG-1001', brandName: 'Panadol', genericName: 'Paracetamol', dosageStrength: '500mg', dosageForm: 'Tablet', packSize: '10', packagingType: 'Blister', shelfLife: '24 Months', manufacturerName: 'GSK', manufacturerAddress: 'UK', manufacturerCountry: 'UK', registrationDate: new Date() }
  });

  const med = await prisma.medication.upsert({
    where: { id: id(21, 1) }, update: {},
    create: { id: id(21, 1), pharmacyId: pharmacy.id, branchId: branch1.id, registryId: medRegistry.id, name: 'Panadol 500mg', price: 1000, quantity: 100 }
  });

  const consumable = await prisma.hospitalConsumableStock.upsert({
    where: { hospitalId_itemName: { hospitalId: hospital1.id, itemName: 'Surgical Gloves' } }, update: {},
    create: { id: id(22, 1), hospitalId: hospital1.id, itemName: 'Surgical Gloves', quantity: 500 }
  });

  // ==========================================
  // 5. APPOINTMENTS
  // ==========================================
  const apptStatuses = Object.values(AppointmentStatus); 
  for (let i = 0; i < 10; i++) {
    const status = apptStatuses[i % apptStatuses.length];
    const patient = patients[i % patients.length];
    const apptId = id(25, i + 1);

    await prisma.appointment.upsert({
      where: { id: apptId }, update: { status },
      create: { id: apptId, patientId: patient.id, doctorId: doctor.id, hospitalId: hospital1.id, date: new Date(), status, type: AppointmentType.ONLINE, reason: `Consultation ${i}` }
    });
  }

  // ==========================================
  // 6. CHAT MESSAGES & GATEWAY NOTIFICATIONS
  // ==========================================
  console.log('💬 Seeding Chat Histories & WebSocket Notifications...');
  
  const doctorUserId = id(1, 7);
  const patient1UserId = id(1, 21); 
  const patient2UserId = id(1, 22); 
  const appt1Id = id(25, 1);
  const appt2Id = id(25, 2);

  // Thread 1: Ongoing consultation (Patient 1)
  const chatThread1 = [
    { sender: patient1UserId, receiver: doctorUserId, content: "Hi Doctor Sarah, I've been feeling dizzy since this morning.", isRead: true },
    { sender: doctorUserId, receiver: patient1UserId, content: "Hello! Did you experience this after taking the new medication?", isRead: true },
    { sender: patient1UserId, receiver: doctorUserId, content: "Yes, about an hour after.", isRead: true },
    { sender: doctorUserId, receiver: patient1UserId, content: "Please stop taking it immediately. I am going to update your prescription.", isRead: true },
    { sender: patient1UserId, receiver: doctorUserId, content: "Thank you. Should I come in?", isRead: false }, // Unread by doctor
    { sender: patient1UserId, receiver: doctorUserId, content: "My headache is also getting worse.", isRead: false }, // Unread by doctor
  ];

  // Thread 2: Completed/Follow-up (Patient 2)
  const chatThread2 = [
    { sender: doctorUserId, receiver: patient2UserId, content: "Hello, your lab results look normal. Nothing to worry about.", isRead: true },
    { sender: patient2UserId, receiver: doctorUserId, content: "That is a huge relief! Thanks Doctor.", isRead: true },
    { sender: doctorUserId, receiver: patient2UserId, content: "You're welcome. Remember to schedule your 6-month checkup.", isRead: false }, // Unread by patient
  ];

  const allThreads = [
    { appt: appt1Id, messages: chatThread1 },
    { appt: appt2Id, messages: chatThread2 }
  ];

  let msgCounter = 1;
  let notifCounter = 1;
  const now = Date.now();

  for (const thread of allThreads) {
    for (let i = 0; i < thread.messages.length; i++) {
      const msg = thread.messages[i];
      const msgId = id(60, msgCounter++);
      
      // Stagger timestamps so earlier messages are literally older
      const timestamp = new Date(now - (thread.messages.length - i) * 60000);

      await prisma.chatMessage.upsert({
        where: { id: msgId },
        update: {},
        create: {
          id: msgId,
          appointmentId: thread.appt,
          senderId: msg.sender,
          receiverId: msg.receiver,
          content: msg.content,
          isRead: msg.isRead,
          createdAt: timestamp
        }
      });

      // Generate a corresponding notification for unread messages to test the bell icon
      if (!msg.isRead) {
        await prisma.notification.upsert({
          where: { id: id(61, notifCounter++) },
          update: {},
          create: {
            id: id(61, notifCounter - 1),
            userId: msg.receiver,
            type: NotificationType.NEW_CHAT_MESSAGE,
            title: 'New Message',
            message: `You have an unread message regarding your appointment.`,
            isRead: false,
            createdAt: timestamp
          }
        });
      }
    }
  }

  // General App Notifications
  const generalNotifs = [
    { user: patient1UserId, type: NotificationType.APPOINTMENT_BOOKED, title: 'Appointment Confirmed', msg: 'Your online consultation is scheduled.' },
    { user: doctorUserId, type: NotificationType.PATIENT_ARRIVED, title: 'Patient Waiting', msg: 'A patient is ready in the virtual waiting room.' },
    { user: patient1UserId, type: NotificationType.PRESCRIPTION_DISPATCHED, title: 'Prescription Ready', msg: 'Your updated prescription is ready.' }
  ];

  for (const n of generalNotifs) {
    await prisma.notification.upsert({
      where: { id: id(61, notifCounter++) }, update: {},
      create: { id: id(61, notifCounter - 1), userId: n.user, type: n.type, title: n.title, message: n.msg, isRead: false }
    });
  }

  console.log('\n✅ Gateway Seed complete! Chat histories and real-time notification states are ready for WebSocket testing.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
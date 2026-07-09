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
  console.log('🌱 Starting Full Matrix Seed: Bulk Data + 55/55 Table Coverage...');
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

  const branch2 = await prisma.branch.upsert({
    where: { id: id(3, 2) }, update: {},
    create: { id: id(3, 2), pharmacyId: pharmacy.id, name: 'Secondary Branch', address: 'Kigali Hub', phone: '+250788000099', status: BranchStatus.APPROVED }
  });

  const hospital1 = await prisma.hospital.upsert({
    where: { userId: id(1, 6) }, update: {},
    create: { id: id(4, 1), userId: id(1, 6), name: 'General Hospital', address: 'Kigali', phone: '+250788000003', status: PharmacyStatus.APPROVED }
  });

  const hospital2 = await prisma.hospital.upsert({
    where: { userId: id(1, 12) }, update: {},
    create: { id: id(4, 2), userId: id(1, 12), name: 'Specialty Clinic', address: 'Kigali South', phone: '+250788000004', status: PharmacyStatus.APPROVED }
  });

  await prisma.hospitalConfig.upsert({
    where: { hospitalId: hospital1.id }, update: {},
    create: { id: id(5, 1), hospitalId: hospital1.id, consultationFee: 15000, triageFee: 5000 }
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
  const staff = await prisma.staff.upsert({
    where: { userId: id(1, 4) }, update: {},
    create: { id: id(9, 1), userId: id(1, 4), branchId: branch1.id, firstName: 'John', lastName: 'Pharmacist', status: StaffStatus.ACTIVE }
  });

  await prisma.staffPermissions.upsert({
    where: { staffId: staff.id }, update: {},
    create: { id: id(10, 1), staffId: staff.id, permissions: ['MANAGE_INVENTORY', 'PROCESS_ORDERS'] }
  });

  await prisma.attendance.upsert({
    where: { id: id(11, 1) }, update: {},
    create: { id: id(11, 1), staffId: staff.id, branchId: branch1.id, clockInTime: new Date(), status: AttendanceStatus.APPROVED }
  });

  const doctor = await prisma.doctor.upsert({
    where: { userId: id(1, 7) }, update: {},
    create: { id: id(12, 1), userId: id(1, 7), hospitalId: hospital1.id, specialization: 'General Surgery', licenseNumber: 'RW-MED-001', firstName: 'Sarah', lastName: 'Doctor' }
  });

  await prisma.doctorSchedule.upsert({
    where: { doctorId_dayOfWeek_startTime: { doctorId: doctor.id, dayOfWeek: 1, startTime: '08:00' } }, update: {},
    create: { id: id(13, 1), doctorId: doctor.id, dayOfWeek: 1, startTime: '08:00', endTime: '17:00' }
  });

  await prisma.doctorLeave.upsert({
    where: { id: id(14, 1) }, update: {},
    create: { id: id(14, 1), doctorId: doctor.id, startDate: new Date(), endDate: new Date(Date.now() + 86400000), reason: 'Annual Leave', status: LeaveStatus.APPROVED }
  });

  const nurse = await prisma.hospitalStaff.upsert({
    where: { userId: id(1, 8) }, update: {},
    create: { id: id(15, 1), userId: id(1, 8), hospitalId: hospital1.id, firstName: 'Mike', lastName: 'Nurse', department: 'Ward' }
  });

  const tech = await prisma.hospitalStaff.upsert({
    where: { userId: id(1, 9) }, update: {},
    create: { id: id(16, 1), userId: id(1, 9), hospitalId: hospital1.id, firstName: 'Alex', lastName: 'Tech', department: 'Laboratory' }
  });

  // Link Patients to Hospital and access logs
  for (const patient of patients) {
    await prisma.hospitalPatientRegistration.upsert({
      where: { patientId_hospitalId: { patientId: patient.id, hospitalId: hospital1.id } }, update: {},
      create: { id: id(17, parseInt(patient.id.slice(-4), 16)), patientId: patient.id, hospitalId: hospital1.id, mrn: patient.mrn! }
    });
  }

  await prisma.medicalHistoryAccess.upsert({
    where: { token: 'ACCESS-TOKEN-123' }, update: {},
    create: { id: id(18, 1), doctorId: doctor.id, patientId: patients[0].id, token: 'ACCESS-TOKEN-123', expiresAt: new Date(Date.now() + 86400000) }
  });

  await prisma.medicalRecordLog.upsert({
    where: { id: id(19, 1) }, update: {},
    create: { id: id(19, 1), patientId: patients[0].id, doctorId: doctor.id, accessType: 'VIEW_HISTORY', reason: 'Routine Checkup' }
  });

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

  await prisma.hospitalDrugStock.upsert({
    where: { drugId_hospitalId: { drugId: medRegistry.id, hospitalId: hospital1.id } }, update: {},
    create: { drugId: medRegistry.id, hospitalId: hospital1.id, quantity: 50, unitPrice: 1200, expiryDate: new Date(Date.now() + 31536000000) }
  });

  const consumable = await prisma.hospitalConsumableStock.upsert({
    where: { hospitalId_itemName: { hospitalId: hospital1.id, itemName: 'Surgical Gloves' } }, update: {},
    create: { id: id(22, 1), hospitalId: hospital1.id, itemName: 'Surgical Gloves', quantity: 500 }
  });

  const transfer = await prisma.stockTransfer.upsert({
    where: { id: id(23, 1) }, update: {},
    create: { id: id(23, 1), fromBranchId: branch1.id, toBranchId: branch2.id, status: TransferStatus.COMPLETED }
  });

  await prisma.stockTransferItem.upsert({
    where: { id: id(24, 1) }, update: {},
    create: { id: id(24, 1), transferId: transfer.id, medicationId: med.id, quantity: 20 }
  });

  // ==========================================
  // 5. APPOINTMENTS, DIAGNOSTICS & PRESCRIPTIONS
  // ==========================================
  const apptStatuses = Object.values(AppointmentStatus); 
  const diagStatuses = Object.values(DiagnosticStatus);

  for (let i = 0; i < 15; i++) {
    const status = apptStatuses[i % apptStatuses.length];
    const patient = patients[i % patients.length];
    const apptId = id(25, i + 1);

    const appt = await prisma.appointment.upsert({
      where: { id: apptId }, update: { status },
      create: { id: apptId, patientId: patient.id, doctorId: doctor.id, hospitalId: hospital1.id, date: new Date(), status, type: AppointmentType.IN_PERSON, reason: `Checkup ${i}` }
    });

    // Link a few Telemedicine logs & Vitals
    if (i < 3) {
      await prisma.telemedicineSessionLog.upsert({
        where: { id: id(26, i + 1) }, update: {},
        create: { id: id(26, i + 1), appointmentId: appt.id, userId: patient.userId, role: 'PATIENT', action: 'JOINED_WAITING_ROOM' }
      });
      await prisma.triageVitals.upsert({
        where: { appointmentId: appt.id }, update: {},
        create: { id: id(27, i + 1), appointmentId: appt.id, bloodPressure: '120/80', temperature: 37.2, weight: 75, heartRate: 80, oxygenSaturation: 98 }
      });
    }

    // Link Diagnostics
    const dStatus = diagStatuses[i % diagStatuses.length];
    await prisma.diagnosticOrder.upsert({
      where: { id: id(28, i + 1) }, update: { status: dStatus },
      create: { id: id(28, i + 1), patientId: patient.id, doctorId: doctor.id, appointmentId: appt.id, technicianId: tech.id, testType: DiagnosticType.BLOOD, icd10Code: 'R10.9', status: dStatus }
    });

    // Link Prescriptions
    const rx = await prisma.prescription.upsert({
      where: { id: id(29, i + 1) }, update: {},
      create: { id: id(29, i + 1), patientId: patient.id, doctorId: doctor.id, appointmentId: appt.id, hospitalId: hospital1.id, diagnosis: 'Suspected Infection', status: 'APPROVED' }
    });
    
    await prisma.prescriptionMedication.upsert({
      where: { id: id(30, i + 1) }, update: {},
      create: { id: id(30, i + 1), prescriptionId: rx.id, medicationName: 'Panadol 500mg', matchedMedicationId: med.id, quantity: 2, dispenseStatus: DispenseStatus.PENDING }
    });
  }

  await prisma.diagnosticConsumableBOM.upsert({
    where: { diagnosticType_consumableId: { diagnosticType: DiagnosticType.BLOOD, consumableId: consumable.id } }, update: {},
    create: { id: id(31, 1), diagnosticType: DiagnosticType.BLOOD, consumableId: consumable.id, quantityUsed: 2 }
  });

  // ==========================================
  // 6. INPATIENT & SURGERY MATRIX
  // ==========================================
  const admStatuses = Object.values(AdmissionStatus); 
  for (let i = 0; i < 10; i++) {
    const status = admStatuses[i % admStatuses.length];
    const patient = patients[i % patients.length];
    
    const admission = await prisma.inpatientAdmission.upsert({
      where: { id: id(32, i + 1) }, update: { status },
      create: { id: id(32, i + 1), patientId: patient.id, hospitalId: hospital1.id, admittedByUserId: doctor.userId, admittedByName: 'Sarah Doctor', admittedByRole: 'DOCTOR', reason: `Observation ${i}`, bedId: bed.id, status, admittedAt: new Date() }
    });

    // Link deep operational models to the first 3 admissions
    if (i < 3) {
      await prisma.inpatientVitals.upsert({
        where: { id: id(33, i + 1) }, update: {},
        create: { id: id(33, i + 1), admissionId: admission.id, recordedById: nurse.id, readings: { hr: 85, bp: '125/82' }, checklist: { checked: true } }
      });
      await prisma.mARLog.upsert({
        where: { id: id(34, i + 1) }, update: {},
        create: { id: id(34, i + 1), admissionId: admission.id, administeredById: nurse.id, medicationName: 'IV Fluids', dose: '500ml', administeredAt: new Date() }
      });
      await prisma.nursingHandover.upsert({
        where: { id: id(35, i + 1) }, update: {},
        create: { id: id(35, i + 1), admissionId: admission.id, handedOverById: nurse.id, shiftType: ShiftType.MORNING, checklist: { vitals: true, meds: true } }
      });
      await prisma.supplyConsumption.upsert({
        where: { id: id(36, i + 1) }, update: {},
        create: { id: id(36, i + 1), admissionId: admission.id, itemName: 'Syringe 5ml', category: 'General', quantity: 2, unitCost: 100, totalCost: 200, administeredBy: nurse.id }
      });
    }
  }

  for (let i = 0; i < 10; i++) {
    const status = i < 5 ? SurgeryStatus.SCHEDULED : SurgeryStatus.COMPLETED;
    const patient = patients[i % patients.length];
    const surgery = await prisma.surgeryBooking.upsert({
      where: { id: id(37, i + 1) }, update: { status },
      create: { id: id(37, i + 1), hospitalId: hospital1.id, theaterId: theater.id, patientId: patient.id, procedureName: `Procedure ${i}`, startTime: new Date(Date.now() + i * 86400000), endTime: new Date(Date.now() + i * 86400000 + 7200000), status }
    });

    if (i < 2) {
      await prisma.surgicalTeamAssignment.upsert({
        where: { id: id(38, i + 1) }, update: {},
        create: { id: id(38, i + 1), bookingId: surgery.id, role: SurgicalRole.SURGEON, doctorId: doctor.id }
      });
      await prisma.surgeryConsumableBOM.upsert({
        where: { procedureName_consumableId: { procedureName: `Procedure ${i}`, consumableId: consumable.id } }, update: {},
        create: { id: id(39, i + 1), procedureName: `Procedure ${i}`, consumableId: consumable.id, quantityUsed: 5 }
      });
    }
  }

  await prisma.referral.upsert({
    where: { id: id(40, 1) }, update: {},
    create: { id: id(40, 1), patientId: patients[0].id, sourceHospitalId: hospital1.id, targetHospitalId: hospital2.id, authorizingDoctorId: doctor.id, reason: 'Specialist MRI required', status: ReferralStatus.PENDING }
  });

  // ==========================================
  // 7. PHARMACY ORDERS & CARTS
  // ==========================================
  await prisma.cartItem.upsert({
    where: { patientId_medicationId: { patientId: patients[0].id, medicationId: med.id } }, update: {},
    create: { id: id(41, 1), patientId: patients[0].id, pharmacyId: pharmacy.id, medicationId: med.id, quantity: 1 }
  });

  const orderStatuses = Object.values(OrderStatus);
  const paymentStatuses = Object.values(PaymentStatus);

  for (let i = 0; i < 15; i++) {
    const oStatus = orderStatuses[i % orderStatuses.length];
    const pStatus = paymentStatuses[i % paymentStatuses.length];
    const patient = patients[i % patients.length];
    
    const order = await prisma.order.upsert({
      where: { orderNumber: `ORD-BULK-${i}` }, update: { status: oStatus },
      create: { id: id(42, i + 1), orderNumber: `ORD-BULK-${i}`, patientId: patient.id, pharmacyId: pharmacy.id, branchId: branch1.id, type: OrderType.PICKUP, status: oStatus, total: 2000, subtotal: 2000, paymentMethod: PaymentMethod.MTN_MOMO }
    });

    await prisma.orderItem.upsert({
      where: { id: id(43, i + 1) }, update: {},
      create: { id: id(43, i + 1), orderId: order.id, medicationId: med.id, quantity: 2, price: 1000 }
    });

    await prisma.payment.upsert({
      where: { orderId: order.id }, update: { status: pStatus },
      create: { id: id(44, i + 1), orderId: order.id, amount: 2000, paymentMethod: PaymentMethod.MTN_MOMO, status: pStatus, transactionId: `TXN-BULK-${i}` }
    });
  }

  // ==========================================
  // 8. BILLING, ADMIN & SYSTEM LOGS
  // ==========================================
  const standardInvoice = await prisma.invoice.upsert({
    where: { appointmentId: id(25, 1) }, update: {},
    create: { id: id(45, 1), hospitalId: hospital1.id, patientId: patients[0].id, appointmentId: id(25, 1), totalAmount: 15000, status: InvoiceStatus.PAID, dueDate: new Date() }
  });

  await prisma.invoiceItem.upsert({
    where: { id: id(46, 1) }, update: {},
    create: { id: id(46, 1), invoiceId: standardInvoice.id, description: 'General Consultation', quantity: 1, unitPrice: 15000, subtotal: 15000 }
  });

  const hospInvoice = await prisma.hospitalInvoice.upsert({
    where: { appointmentId: id(25, 2) }, update: {},
    create: { id: id(47, 1), appointmentId: id(25, 2), patientId: patients[1].id, hospitalId: hospital1.id, totalAmount: 20000, paymentStatus: HospitalBillingStatus.INSURANCE_PENDING, insuranceCovered: true }
  });

  await prisma.hospitalInvoiceItem.upsert({
    where: { id: id(48, 1) }, update: {},
    create: { id: id(48, 1), invoiceId: hospInvoice.id, description: 'Triage & Materials', quantity: 1, unitCost: 20000, subtotal: 20000 }
  });

  await prisma.hospitalPayment.upsert({
    where: { id: id(49, 1) }, update: {},
    create: { id: id(49, 1), invoiceId: standardInvoice.id, patientId: patients[0].id, amount: 15000, method: PaymentMethod.CASH, status: PaymentStatus.COMPLETED }
  });

  await prisma.insuranceClaim.upsert({
    where: { invoiceId: hospInvoice.id }, update: {},
    create: { id: id(50, 1), invoiceId: hospInvoice.id, provider: 'RSSB', claimAmount: 16000, status: ClaimStatus.PENDING }
  });

  await prisma.platformSubscriptionCharge.upsert({
    where: { id: id(51, 1) }, update: {},
    create: { id: id(51, 1), hospitalId: hospital1.id, amount: 50000, description: 'Monthly SaaS Tier' }
  });

  const ticketStatuses = Object.values(SupportTicketStatus);
  for (let i = 0; i < 5; i++) {
    await prisma.supportTicket.upsert({
      where: { ticketNumber: `TKT-BULK-${i}` }, update: { status: ticketStatuses[i % ticketStatuses.length] },
      create: { id: id(52, i + 1), ticketNumber: `TKT-BULK-${i}`, name: patients[0].firstName, email: `patient${i}@evuze.rw`, category: SupportTicketCategory.technical, message: `Issue report ${i}`, status: ticketStatuses[i % ticketStatuses.length], userId: patients[0].userId }
    });
  }

  await prisma.notification.upsert({
    where: { id: id(53, 1) }, update: {},
    create: { id: id(53, 1), userId: patients[0].userId, patientId: patients[0].id, type: NotificationType.ORDER_PLACED, title: 'System Setup', message: 'Test initialization complete.' }
  });

  await prisma.auditLog.upsert({
    where: { id: id(54, 1) }, update: {},
    create: { id: id(54, 1), actorId: id(1, 1), actorRole: 'SUPER_ADMIN', action: 'DATABASE_SEED', targetType: 'System', outcome: 'SUCCESS' }
  });

  console.log('\n✅ Mission Accomplished! All 55 tables are heavily populated with looped data, strict UUIDs, and perfect referential integrity.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
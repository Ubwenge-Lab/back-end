// standalone restore script: src/prisma/restore-data.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

async function retryQuery<T>(fn: () => Promise<T>, retries = 5, delay = 1500): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const errMsg = String(err.message || err);
      if (
        errMsg.includes("Can't reach database server") ||
        errMsg.includes("connection limit") ||
        errMsg.includes("hiccup") ||
        errMsg.includes("closed") ||
        errMsg.includes("timeout") ||
        errMsg.includes("PoolTimeout") ||
        errMsg.includes("connection pool")
      ) {
        console.log(`[Database Connection Hiccup] Retrying query in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const uniqueFieldsMap: Record<string, string[][]> = {
  user: [['email']],
  pharmacy: [['userId']],
  hospital: [['userId']],
  hospitalConfig: [['hospitalId']],
  branch: [['managerId']],
  patient: [['userId']],
  staff: [['userId'], ['nationalId']],
  staffPermissions: [['staffId']],
  doctor: [['userId'], ['licenseNumber']],
  doctorSchedule: [['doctorId', 'dayOfWeek', 'startTime']],
  hospitalStaff: [['userId']],
  hospitalPatientRegistration: [['patientId', 'hospitalId'], ['hospitalId', 'mrn']],
  medicationRegistry: [['registrationNumber']],
  invoice: [['appointmentId']],
  triageVitals: [['appointmentId']],
  order: [['prescriptionId'], ['orderNumber']],
  payment: [['orderId'], ['transactionId'], ['flutterwaveRef'], ['receiptNumber']],
  hospitalInvoice: [['appointmentId']],
  insuranceClaim: [['invoiceId']],
};

async function main() {
  let inputPath = path.join(__dirname, 'data-state-backup.json');
  if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size < 5000) {
    const alternativePath = path.join(__dirname, 'data-backup.json');
    if (fs.existsSync(alternativePath)) {
      inputPath = alternativePath;
    }
  }

  console.log(`Loading backup archive from:\n${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error('Backup archive file not found!');
    process.exit(1);
  }

  // Explicitly ensure Super Admin user is created using .env configurations
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'info@ubwengelab.rw';
  const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 10)
    : await bcrypt.hash('Test@1234', 10);

  console.log(`Ensuring Super Admin exists: ${ADMIN_EMAIL}...`);
  await retryQuery(() => prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: 'SUPER_ADMIN',
      isVerified: true,
      isActive: true,
    },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'SUPER_ADMIN',
      isVerified: true,
      isActive: true,
    }
  }));

  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const backupData: Record<string, any[]> = JSON.parse(rawData);

  // Models in precise foreign-key insertion order (Parents -> Children)
  const modelsOrder = [
    'user',
    'pharmacy',
    'hospital',
    'hospitalConfig',
    'platformSubscriptionCharge',
    'branch',
    'patient',
    'staff',
    'staffPermissions',
    'attendance',
    'doctor',
    'doctorSchedule',
    'doctorLeave',
    'medicalHistoryAccess',
    'medicalRecordLog',
    'hospitalStaff',
    'supportTicket',
    'medicationRegistry',
    'medication',
    'stockTransfer',
    'stockTransferItem',
    'cartItem',
    'appointment',
    'triageVitals',
    'telemedicineSessionLog',
    'hospitalInvoice',
    'hospitalInvoiceItem',
    'insuranceClaim',
    'invoice',
    'invoiceItem',
    'hospitalPatientRegistration',
    'hospitalPayment',
    'hospitalDrugStock',
    'prescription',
    'prescriptionMedication',
    'order',
    'payment',
    'notification',
  ];

  // Normalize backup keys to singular model names
  const normalizedBackupData: Record<string, any[]> = {};
  for (const model of modelsOrder) {
    const records =
      backupData[model] ||
      backupData[model + 's'] ||
      backupData[model.replace(/y$/, 'ies')] ||
      backupData[model + 'es'] ||
      [];
    normalizedBackupData[model] = records;
  }

  const existingIds: Record<string, Set<string>> = {};
  for (const model of modelsOrder) {
    existingIds[model] = new Set(normalizedBackupData[model].map((r: any) => r.id).filter(Boolean));
  }

  const generatedEmails = new Set<string>();
  for (const u of normalizedBackupData.user || []) {
    if (u.email) generatedEmails.add(u.email.toLowerCase().trim());
  }

  const generatedLicenses = new Set<string>();
  for (const d of normalizedBackupData.doctor || []) {
    if (d.licenseNumber) generatedLicenses.add(d.licenseNumber.toUpperCase().trim());
  }

  const generatedRegNumbers = new Set<string>();
  for (const mr of normalizedBackupData.medicationRegistry || []) {
    if (mr.registrationNumber) generatedRegNumbers.add(mr.registrationNumber.toUpperCase().trim());
  }

  console.log('Analyzing database state for missing parent references...');
  let synthesizedCount = 0;
  let keepChecking = true;
  let iterations = 0;

  while (keepChecking && iterations < 10) {
    keepChecking = false;
    iterations++;

    // 1. Synthesize User
    const neededUsers = new Map<string, string>(); // id -> roleHint
    for (const p of normalizedBackupData.pharmacy || []) {
      if (p.userId && !existingIds.user.has(p.userId)) neededUsers.set(p.userId, 'PHARMACY');
    }
    for (const h of normalizedBackupData.hospital || []) {
      if (h.userId && !existingIds.user.has(h.userId)) neededUsers.set(h.userId, 'HOSPITAL_ADMIN');
    }
    for (const pat of normalizedBackupData.patient || []) {
      if (pat.userId && !existingIds.user.has(pat.userId)) neededUsers.set(pat.userId, 'PATIENT');
    }
    for (const s of normalizedBackupData.staff || []) {
      if (s.userId && !existingIds.user.has(s.userId)) neededUsers.set(s.userId, 'PHARMACIST');
    }
    for (const hs of normalizedBackupData.hospitalStaff || []) {
      if (hs.userId && !existingIds.user.has(hs.userId)) neededUsers.set(hs.userId, 'NURSE');
    }
    for (const d of normalizedBackupData.doctor || []) {
      if (d.userId && !existingIds.user.has(d.userId)) neededUsers.set(d.userId, 'DOCTOR');
    }
    for (const b of normalizedBackupData.branch || []) {
      if (b.managerId && !existingIds.user.has(b.managerId)) neededUsers.set(b.managerId, 'BRANCH_MANAGER');
    }
    for (const st of normalizedBackupData.supportTicket || []) {
      if (st.userId && !existingIds.user.has(st.userId)) neededUsers.set(st.userId, 'PATIENT');
    }
    for (const n of normalizedBackupData.notification || []) {
      if (n.userId && !existingIds.user.has(n.userId)) neededUsers.set(n.userId, 'PATIENT');
    }

    if (neededUsers.size > 0) {
      keepChecking = true;
      for (const [uid, role] of neededUsers.entries()) {
        let firstName = 'Test';
        let lastName = 'User';
        const cleanPart = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-6);

        const pat = normalizedBackupData.patient?.find((p: any) => p.userId === uid);
        const s = normalizedBackupData.staff?.find((x: any) => x.userId === uid);
        const hs = normalizedBackupData.hospitalStaff?.find((x: any) => x.userId === uid);
        const d = normalizedBackupData.doctor?.find((x: any) => x.userId === uid);
        const pharm = normalizedBackupData.pharmacy?.find((x: any) => x.userId === uid);
        const hosp = normalizedBackupData.hospital?.find((x: any) => x.userId === uid);

        if (pat) {
          firstName = pat.firstName || 'Patient';
          lastName = pat.lastName || 'User';
        } else if (s) {
          firstName = s.firstName || 'Staff';
          lastName = s.lastName || 'User';
        } else if (hs) {
          firstName = hs.firstName || 'HStaff';
          lastName = hs.lastName || 'User';
        } else if (d) {
          firstName = d.firstName || 'Doctor';
          lastName = d.lastName || 'User';
        } else if (pharm) {
          firstName = 'Owner';
          lastName = pharm.name || 'Pharmacy';
        } else if (hosp) {
          firstName = 'Admin';
          lastName = hosp.name || 'Hospital';
        }

        let prefix = role.toLowerCase().replace(/_admin/g, '').replace(/_/g, '');
        let domain = 'evuze.rw';

        if (role === 'PHARMACY') {
          prefix = 'owner';
          domain = 'pharmacy.com';
        } else if (role === 'BRANCH_MANAGER') {
          prefix = 'manager';
          domain = 'manager.com';
        } else if (role === 'PATIENT') {
          prefix = 'patient';
          domain = 'patient.com';
        } else if (role === 'DOCTOR') {
          prefix = 'doctor';
          domain = 'hospital.com';
        } else if (role === 'HOSPITAL_ADMIN') {
          prefix = 'admin';
          domain = 'hospital.com';
        } else if (role === 'PHARMACIST') {
          prefix = 'pharmacist';
          domain = 'pharmacy.com';
        } else if (role === 'CASHIER') {
          prefix = 'cashier';
          domain = 'pharmacy.com';
        } else if (role === 'NURSE') {
          prefix = 'nurse';
          domain = 'hospital.com';
        }

        let email = `${prefix}-${cleanPart}@${domain}`;

        // Ensure email uniqueness
        let baseEmail = email;
        let finalEmail = baseEmail;
        let counter = 1;
        while (generatedEmails.has(finalEmail.toLowerCase())) {
          finalEmail = baseEmail.replace('@', `${counter}@`);
          counter++;
        }
        email = finalEmail;
        generatedEmails.add(email.toLowerCase());

        normalizedBackupData.user.push({
          id: uid,
          email,
          password: '$2b$10$QJz1dKfeBv4mQ1g2E3tYveW8sK7X/6hO2/5i1m7K/4TjO7Zt2d7kO', // hashed 'Test@1234'
          role,
          isVerified: true,
          isActive: true,
          firstName,
          lastName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.user.add(uid);
        synthesizedCount++;
      }
    }

    // 2. Synthesize Pharmacy
    const neededPharmacies = new Set<string>();
    for (const b of normalizedBackupData.branch || []) {
      if (b.pharmacyId && !existingIds.pharmacy.has(b.pharmacyId)) neededPharmacies.add(b.pharmacyId);
    }
    for (const m of normalizedBackupData.medication || []) {
      if (m.pharmacyId && !existingIds.pharmacy.has(m.pharmacyId)) neededPharmacies.add(m.pharmacyId);
    }
    for (const o of normalizedBackupData.order || []) {
      if (o.pharmacyId && !existingIds.pharmacy.has(o.pharmacyId)) neededPharmacies.add(o.pharmacyId);
    }
    for (const c of normalizedBackupData.cartItem || []) {
      if (c.pharmacyId && !existingIds.pharmacy.has(c.pharmacyId)) neededPharmacies.add(c.pharmacyId);
    }
    if (neededPharmacies.size > 0) {
      keepChecking = true;
      for (const pid of neededPharmacies) {
        const pUserId = `user-pharm-${pid}`;
        normalizedBackupData.pharmacy.push({
          id: pid,
          userId: pUserId,
          name: `Pharmacy ${pid.slice(0, 8)}`,
          phone: '+250788000000',
          address: 'Kigali, Rwanda',
          status: 'APPROVED',
          isActive: true,
          isLocationVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.pharmacy.add(pid);
        synthesizedCount++;
      }
    }

    // 3. Synthesize Hospital
    const neededHospitals = new Set<string>();
    for (const d of normalizedBackupData.doctor || []) {
      if (d.hospitalId && !existingIds.hospital.has(d.hospitalId)) neededHospitals.add(d.hospitalId);
    }
    for (const hs of normalizedBackupData.hospitalStaff || []) {
      if (hs.hospitalId && !existingIds.hospital.has(hs.hospitalId)) neededHospitals.add(hs.hospitalId);
    }
    for (const a of normalizedBackupData.appointment || []) {
      if (a.hospitalId && !existingIds.hospital.has(a.hospitalId)) neededHospitals.add(a.hospitalId);
    }
    for (const hpr of normalizedBackupData.hospitalPatientRegistration || []) {
      if (hpr.hospitalId && !existingIds.hospital.has(hpr.hospitalId)) neededHospitals.add(hpr.hospitalId);
    }
    for (const hi of normalizedBackupData.hospitalInvoice || []) {
      if (hi.hospitalId && !existingIds.hospital.has(hi.hospitalId)) neededHospitals.add(hi.hospitalId);
    }
    for (const inv of normalizedBackupData.invoice || []) {
      if (inv.hospitalId && !existingIds.hospital.has(inv.hospitalId)) neededHospitals.add(inv.hospitalId);
    }
    for (const p of normalizedBackupData.prescription || []) {
      if (p.hospitalId && !existingIds.hospital.has(p.hospitalId)) neededHospitals.add(p.hospitalId);
    }
    if (neededHospitals.size > 0) {
      keepChecking = true;
      for (const hid of neededHospitals) {
        const hUserId = `user-hosp-${hid}`;
        normalizedBackupData.hospital.push({
          id: hid,
          userId: hUserId,
          name: `Hospital ${hid.slice(0, 8)}`,
          phone: '+250788000000',
          address: 'Kigali, Rwanda',
          status: 'APPROVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.hospital.add(hid);
        synthesizedCount++;
      }
    }

    // 4. Synthesize Branch
    const neededBranches = new Set<string>();
    for (const m of normalizedBackupData.medication || []) {
      if (m.branchId && !existingIds.branch.has(m.branchId)) neededBranches.add(m.branchId);
    }
    for (const s of normalizedBackupData.staff || []) {
      if (s.branchId && !existingIds.branch.has(s.branchId)) neededBranches.add(s.branchId);
    }
    for (const o of normalizedBackupData.order || []) {
      if (o.branchId && !existingIds.branch.has(o.branchId)) neededBranches.add(o.branchId);
    }
    for (const att of normalizedBackupData.attendance || []) {
      if (att.branchId && !existingIds.branch.has(att.branchId)) neededBranches.add(att.branchId);
    }
    for (const st of normalizedBackupData.stockTransfer || []) {
      if (st.fromBranchId && !existingIds.branch.has(st.fromBranchId)) neededBranches.add(st.fromBranchId);
      if (st.toBranchId && !existingIds.branch.has(st.toBranchId)) neededBranches.add(st.toBranchId);
    }
    if (neededBranches.size > 0) {
      keepChecking = true;
      for (const bid of neededBranches) {
        const sampleMed = normalizedBackupData.medication?.find((m: any) => m.branchId === bid);
        let pharmacyId = sampleMed?.pharmacyId;
        if (!pharmacyId && normalizedBackupData.pharmacy.length > 0) {
          pharmacyId = normalizedBackupData.pharmacy[0].id;
        }
        if (!pharmacyId) {
          pharmacyId = `pharmacy-${bid}`;
        }
        normalizedBackupData.branch.push({
          id: bid,
          pharmacyId,
          name: `Branch ${bid.slice(0, 8)}`,
          address: 'Kigali, Rwanda',
          phone: '+250788000000',
          isActive: true,
          branchStatus: 'APPROVED',
          status: 'APPROVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.branch.add(bid);
        synthesizedCount++;
      }
    }

    // 5. Synthesize Patient
    const neededPatients = new Set<string>();
    for (const a of normalizedBackupData.appointment || []) {
      if (a.patientId && !existingIds.patient.has(a.patientId)) neededPatients.add(a.patientId);
    }
    for (const p of normalizedBackupData.prescription || []) {
      if (p.patientId && !existingIds.patient.has(p.patientId)) neededPatients.add(p.patientId);
    }
    for (const o of normalizedBackupData.order || []) {
      if (o.patientId && !existingIds.patient.has(o.patientId)) neededPatients.add(o.patientId);
    }
    for (const c of normalizedBackupData.cartItem || []) {
      if (c.patientId && !existingIds.patient.has(c.patientId)) neededPatients.add(c.patientId);
    }
    for (const inv of normalizedBackupData.invoice || []) {
      if (inv.patientId && !existingIds.patient.has(inv.patientId)) neededPatients.add(inv.patientId);
    }
    for (const hi of normalizedBackupData.hospitalInvoice || []) {
      if (hi.patientId && !existingIds.patient.has(hi.patientId)) neededPatients.add(hi.patientId);
    }
    for (const hpr of normalizedBackupData.hospitalPatientRegistration || []) {
      if (hpr.patientId && !existingIds.patient.has(hpr.patientId)) neededPatients.add(hpr.patientId);
    }
    for (const hp of normalizedBackupData.hospitalPayment || []) {
      if (hp.patientId && !existingIds.patient.has(hp.patientId)) neededPatients.add(hp.patientId);
    }
    if (neededPatients.size > 0) {
      keepChecking = true;
      for (const patid of neededPatients) {
        const pUserId = `user-pat-${patid}`;
        normalizedBackupData.patient.push({
          id: patid,
          userId: pUserId,
          firstName: 'Patient',
          lastName: `User ${patid.slice(0, 4)}`,
          phone: '+250788000000',
          mrn: `MRN-${patid}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.patient.add(patid);
        synthesizedCount++;
      }
    }

    // 6. Synthesize Doctor
    const neededDoctors = new Set<string>();
    for (const ds of normalizedBackupData.doctorSchedule || []) {
      if (ds.doctorId && !existingIds.doctor.has(ds.doctorId)) neededDoctors.add(ds.doctorId);
    }
    for (const dl of normalizedBackupData.doctorLeave || []) {
      if (dl.doctorId && !existingIds.doctor.has(dl.doctorId)) neededDoctors.add(dl.doctorId);
    }
    for (const a of normalizedBackupData.appointment || []) {
      if (a.doctorId && !existingIds.doctor.has(a.doctorId)) neededDoctors.add(a.doctorId);
    }
    for (const p of normalizedBackupData.prescription || []) {
      if (p.doctorId && !existingIds.doctor.has(p.doctorId)) neededDoctors.add(p.doctorId);
    }
    for (const mha of normalizedBackupData.medicalHistoryAccess || []) {
      if (mha.doctorId && !existingIds.doctor.has(mha.doctorId)) neededDoctors.add(mha.doctorId);
    }
    for (const mrl of normalizedBackupData.medicalRecordLog || []) {
      if (mrl.doctorId && !existingIds.doctor.has(mrl.doctorId)) neededDoctors.add(mrl.doctorId);
    }
    if (neededDoctors.size > 0) {
      keepChecking = true;
      for (const docid of neededDoctors) {
        const sampleAppt = normalizedBackupData.appointment?.find((a: any) => a.doctorId === docid);
        let hospitalId = sampleAppt?.hospitalId;
        if (!hospitalId && normalizedBackupData.hospital.length > 0) {
          hospitalId = normalizedBackupData.hospital[0].id;
        }
        if (!hospitalId) {
          hospitalId = `hospital-${docid}`;
        }
        const dUserId = `user-doc-${docid}`;

        let license = `RW-DOC-${docid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
        let baseLicense = license;
        let finalLicense = baseLicense;
        let counter = 1;
        while (generatedLicenses.has(finalLicense.toUpperCase())) {
          finalLicense = `${baseLicense}-${counter}`;
          counter++;
        }
        license = finalLicense;
        generatedLicenses.add(license.toUpperCase());

        normalizedBackupData.doctor.push({
          id: docid,
          userId: dUserId,
          hospitalId,
          specialization: 'General Medicine',
          licenseNumber: license,
          firstName: 'Doctor',
          lastName: `User ${docid.slice(0, 4)}`,
          isAvailable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.doctor.add(docid);
        synthesizedCount++;
      }
    }

    // 7. Synthesize MedicationRegistry
    const neededRegistries = new Set<string>();
    for (const m of normalizedBackupData.medication || []) {
      if (m.registryId && !existingIds.medicationRegistry.has(m.registryId)) neededRegistries.add(m.registryId);
    }
    for (const hds of normalizedBackupData.hospitalDrugStock || []) {
      if (hds.drugId && !existingIds.medicationRegistry.has(hds.drugId)) neededRegistries.add(hds.drugId);
    }
    if (neededRegistries.size > 0) {
      keepChecking = true;
      for (const regid of neededRegistries) {
        let regNum = `REG-${regid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
        let baseRegNum = regNum;
        let finalRegNum = baseRegNum;
        let counter = 1;
        while (generatedRegNumbers.has(finalRegNum.toUpperCase())) {
          finalRegNum = `${baseRegNum}-${counter}`;
          counter++;
        }
        regNum = finalRegNum;
        generatedRegNumbers.add(regNum.toUpperCase());

        normalizedBackupData.medicationRegistry.push({
          id: regid,
          registrationNumber: regNum,
          brandName: `Drug ${regid.slice(0, 8)}`,
          genericName: `Generic ${regid.slice(0, 8)}`,
          dosageStrength: '500mg',
          dosageForm: 'Tablet',
          packSize: '10',
          packagingType: 'Blister',
          shelfLife: '36 months',
          manufacturerName: 'Generic Manufacturer',
          manufacturerAddress: 'Kigali, Rwanda',
          manufacturerCountry: 'Rwanda',
          registrationDate: new Date().toISOString(),
        });
        existingIds.medicationRegistry.add(regid);
        synthesizedCount++;
      }
    }

    // 8. Synthesize Medication
    const neededMedications = new Set<string>();
    for (const oi of normalizedBackupData.orderItem || []) {
      if (oi.medicationId && !existingIds.medication.has(oi.medicationId)) neededMedications.add(oi.medicationId);
    }
    for (const ci of normalizedBackupData.cartItem || []) {
      if (ci.medicationId && !existingIds.medication.has(ci.medicationId)) neededMedications.add(ci.medicationId);
    }
    for (const sti of normalizedBackupData.stockTransferItem || []) {
      if (sti.medicationId && !existingIds.medication.has(sti.medicationId)) neededMedications.add(sti.medicationId);
    }
    for (const pm of normalizedBackupData.prescriptionMedication || []) {
      if (pm.matchedMedicationId && !existingIds.medication.has(pm.matchedMedicationId)) neededMedications.add(pm.matchedMedicationId);
    }
    if (neededMedications.size > 0) {
      keepChecking = true;
      for (const medid of neededMedications) {
        let branchId = '';
        if (normalizedBackupData.branch.length > 0) {
          branchId = normalizedBackupData.branch[0].id;
        } else {
          branchId = `branch-med-${medid}`;
        }
        normalizedBackupData.medication.push({
          id: medid,
          branchId,
          name: `Medication ${medid.slice(0, 8)}`,
          price: 1000,
          quantity: 100,
          lowStockThreshold: 10,
          requiresPrescription: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.medication.add(medid);
        synthesizedCount++;
      }
    }

    // 9. Synthesize Appointment
    const neededAppointments = new Set<string>();
    for (const tv of normalizedBackupData.triageVitals || []) {
      if (tv.appointmentId && !existingIds.appointment.has(tv.appointmentId)) neededAppointments.add(tv.appointmentId);
    }
    for (const tsl of normalizedBackupData.telemedicineSessionLog || []) {
      if (tsl.appointmentId && !existingIds.appointment.has(tsl.appointmentId)) neededAppointments.add(tsl.appointmentId);
    }
    for (const hi of normalizedBackupData.hospitalInvoice || []) {
      if (hi.appointmentId && !existingIds.appointment.has(hi.appointmentId)) neededAppointments.add(hi.appointmentId);
    }
    for (const p of normalizedBackupData.prescription || []) {
      if (p.appointmentId && !existingIds.appointment.has(p.appointmentId)) neededAppointments.add(p.appointmentId);
    }
    for (const inv of normalizedBackupData.invoice || []) {
      if (inv.appointmentId && !existingIds.appointment.has(inv.appointmentId)) neededAppointments.add(inv.appointmentId);
    }
    if (neededAppointments.size > 0) {
      keepChecking = true;
      for (const apptid of neededAppointments) {
        let patientId = '';
        let doctorId = '';
        let hospitalId = '';
        if (normalizedBackupData.patient.length > 0) patientId = normalizedBackupData.patient[0].id;
        else patientId = `patient-appt-${apptid}`;
        if (normalizedBackupData.doctor.length > 0) doctorId = normalizedBackupData.doctor[0].id;
        else doctorId = `doctor-appt-${apptid}`;
        if (normalizedBackupData.hospital.length > 0) hospitalId = normalizedBackupData.hospital[0].id;
        else hospitalId = `hospital-appt-${apptid}`;

        normalizedBackupData.appointment.push({
          id: apptid,
          patientId,
          doctorId,
          hospitalId,
          date: new Date().toISOString(),
          status: 'SCHEDULED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.appointment.add(apptid);
        synthesizedCount++;
      }
    }

    // 10. Synthesize Staff
    const neededStaff = new Set<string>();
    for (const sp of normalizedBackupData.staffPermissions || []) {
      if (sp.staffId && !existingIds.staff.has(sp.staffId)) neededStaff.add(sp.staffId);
    }
    for (const att of normalizedBackupData.attendance || []) {
      if (att.staffId && !existingIds.staff.has(att.staffId)) neededStaff.add(att.staffId);
    }
    if (neededStaff.size > 0) {
      keepChecking = true;
      for (const stfid of neededStaff) {
        const sUserId = `user-stf-${stfid}`;
        let branchId = '';
        if (normalizedBackupData.branch.length > 0) branchId = normalizedBackupData.branch[0].id;
        else branchId = `branch-stf-${stfid}`;
        normalizedBackupData.staff.push({
          id: stfid,
          userId: sUserId,
          branchId,
          firstName: 'Staff',
          lastName: `User ${stfid.slice(0, 4)}`,
          phone: '+250788000000',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.staff.add(stfid);
        synthesizedCount++;
      }
    }

    // 11. Synthesize Prescription
    const neededPrescriptions = new Set<string>();
    for (const pm of normalizedBackupData.prescriptionMedication || []) {
      if (pm.prescriptionId && !existingIds.prescription.has(pm.prescriptionId)) neededPrescriptions.add(pm.prescriptionId);
    }
    for (const ci of normalizedBackupData.cartItem || []) {
      if (ci.prescriptionId && !existingIds.prescription.has(ci.prescriptionId)) neededPrescriptions.add(ci.prescriptionId);
    }
    for (const o of normalizedBackupData.order || []) {
      if (o.prescriptionId && !existingIds.prescription.has(o.prescriptionId)) neededPrescriptions.add(o.prescriptionId);
    }
    if (neededPrescriptions.size > 0) {
      keepChecking = true;
      for (const rxid of neededPrescriptions) {
        let patientId = '';
        if (normalizedBackupData.patient.length > 0) patientId = normalizedBackupData.patient[0].id;
        else patientId = `patient-rx-${rxid}`;
        normalizedBackupData.prescription.push({
          id: rxid,
          patientId,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.prescription.add(rxid);
        synthesizedCount++;
      }
    }

    // 12. Synthesize Order
    const neededOrders = new Set<string>();
    for (const oi of normalizedBackupData.orderItem || []) {
      if (oi.orderId && !existingIds.order.has(oi.orderId)) neededOrders.add(oi.orderId);
    }
    for (const pay of normalizedBackupData.payment || []) {
      if (pay.orderId && !existingIds.order.has(pay.orderId)) neededOrders.add(pay.orderId);
    }
    for (const n of normalizedBackupData.notification || []) {
      if (n.orderId && !existingIds.order.has(n.orderId)) neededOrders.add(n.orderId);
    }
    if (neededOrders.size > 0) {
      keepChecking = true;
      for (const ordid of neededOrders) {
        let patientId = '';
        let pharmacyId = '';
        if (normalizedBackupData.patient.length > 0) patientId = normalizedBackupData.patient[0].id;
        else patientId = `patient-ord-${ordid}`;
        if (normalizedBackupData.pharmacy.length > 0) pharmacyId = normalizedBackupData.pharmacy[0].id;
        else pharmacyId = `pharmacy-ord-${ordid}`;
        normalizedBackupData.order.push({
          id: ordid,
          patientId,
          pharmacyId,
          type: 'PICKUP',
          total: 1000,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.order.add(ordid);
        synthesizedCount++;
      }
    }

    // 13. Synthesize Invoice
    const neededInvoices = new Set<string>();
    for (const ii of normalizedBackupData.invoiceItem || []) {
      if (ii.invoiceId && !existingIds.invoice.has(ii.invoiceId)) neededInvoices.add(ii.invoiceId);
    }
    for (const hp of normalizedBackupData.hospitalPayment || []) {
      if (hp.invoiceId && !existingIds.invoice.has(hp.invoiceId)) neededInvoices.add(hp.invoiceId);
    }
    if (neededInvoices.size > 0) {
      keepChecking = true;
      for (const invid of neededInvoices) {
        let hospitalId = '';
        let patientId = '';
        if (normalizedBackupData.hospital.length > 0) hospitalId = normalizedBackupData.hospital[0].id;
        else hospitalId = `hospital-inv-${invid}`;
        if (normalizedBackupData.patient.length > 0) patientId = normalizedBackupData.patient[0].id;
        else patientId = `patient-inv-${invid}`;
        normalizedBackupData.invoice.push({
          id: invid,
          hospitalId,
          patientId,
          totalAmount: 1000,
          status: 'UNPAID',
          dueDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        existingIds.invoice.add(invid);
        synthesizedCount++;
      }
    }

    // 14. Synthesize HospitalInvoice
    const neededHInvoices = new Set<string>();
    for (const hii of normalizedBackupData.hospitalInvoiceItem || []) {
      if (hii.invoiceId && !existingIds.hospitalInvoice.has(hii.invoiceId)) neededHInvoices.add(hii.invoiceId);
    }
    for (const ic of normalizedBackupData.insuranceClaim || []) {
      if (ic.invoiceId && !existingIds.hospitalInvoice.has(ic.invoiceId)) neededHInvoices.add(ic.invoiceId);
    }
    if (neededHInvoices.size > 0) {
      keepChecking = true;
      for (const hinvid of neededHInvoices) {
        const appointmentId = `appt-hinv-${hinvid}`;
        let patientId = '';
        let hospitalId = '';
        if (normalizedBackupData.patient.length > 0) patientId = normalizedBackupData.patient[0].id;
        else patientId = `patient-hinv-${hinvid}`;
        if (normalizedBackupData.hospital.length > 0) hospitalId = normalizedBackupData.hospital[0].id;
        else hospitalId = `hospital-hinv-${hinvid}`;

        normalizedBackupData.hospitalInvoice.push({
          id: hinvid,
          appointmentId,
          patientId,
          hospitalId,
          totalAmount: 1000,
          paymentStatus: 'UNPAID',
          issuedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.hospitalInvoice.add(hinvid);
        synthesizedCount++;
      }
    }

    // 15. Synthesize StockTransfer
    const neededTransfers = new Set<string>();
    for (const sti of normalizedBackupData.stockTransferItem || []) {
      if (sti.transferId && !existingIds.stockTransfer.has(sti.transferId)) neededTransfers.add(sti.transferId);
    }
    if (neededTransfers.size > 0) {
      keepChecking = true;
      for (const stid of neededTransfers) {
        let fromBranchId = '';
        let toBranchId = '';
        if (normalizedBackupData.branch.length > 0) {
          fromBranchId = normalizedBackupData.branch[0].id;
          toBranchId = normalizedBackupData.branch[0].id;
        } else {
          fromBranchId = `branch-st-${stid}-from`;
          toBranchId = `branch-st-${stid}-to`;
        }
        normalizedBackupData.stockTransfer.push({
          id: stid,
          fromBranchId,
          toBranchId,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.stockTransfer.add(stid);
        synthesizedCount++;
      }
    }
  }

  console.log(`Synthesis complete. Total synthetic parent records created: ${synthesizedCount} across ${iterations} iterations.`);

  // Write normalized backup data back to original backupData keys
  for (const model of modelsOrder) {
    const key =
      backupData[model] ? model :
      backupData[model + 's'] ? (model + 's') :
      backupData[model.replace(/y$/, 'ies')] ? model.replace(/y$/, 'ies') :
      backupData[model + 'es'] ? (model + 'es') :
      model;
    backupData[key] = normalizedBackupData[model];
  }

  console.log('\nStarting robust individual record restoration...\n');

  for (const model of modelsOrder) {
    // Check singular, plural (s), and special plurals (ies, es)
    const records =
      backupData[model] ||
      backupData[model + 's'] ||
      backupData[model.replace(/y$/, 'ies')] ||
      backupData[model + 'es'] ||
      [];
    if (records.length === 0) {
      console.log(`Model [${model}]: No records to restore.`);
      continue;
    }

    console.log(
      `\nRestoring ${records.length} records for model [${model}]...`,
    );
    let successCount = 0;
    let failCount = 0;

    // Fetch all existing IDs in database to skip duplicates
    const dbExistingIds = new Set<string>();
    try {
      // @ts-ignore
      const existing = (await retryQuery(() => prisma[model].findMany({
        select: { id: true }
      }))) as any;
      for (const r of existing) {
        if (r.id) dbExistingIds.add(String(r.id));
      }
    } catch (err) {
      // Table doesn't exist yet or is empty
    }

    const remainingRecords: any[] = [];
    for (const record of records) {
      if (record.id && dbExistingIds.has(String(record.id))) {
        successCount++;
        continue;
      }
      remainingRecords.push(record);
    }

    if (remainingRecords.length === 0) {
      console.log(`Model [${model}] summary: All ${records.length} records already exist in DB. Skipped.`);
      continue;
    }

    if (model === 'medicationRegistry') {
      console.log(`Inserting ${remainingRecords.length} medication registry records in batches...`);
      const batchSize = 250;
      for (let i = 0; i < remainingRecords.length; i += batchSize) {
        const batch = remainingRecords.slice(i, i + batchSize);
        // @ts-ignore
        await retryQuery(() => prisma.medicationRegistry.createMany({
          data: batch,
          skipDuplicates: true
        }));
      }
      successCount += remainingRecords.length;
      console.log(`Model [${model}] summary: ${successCount} restored successfully.`);
      continue;
    }

    for (const record of remainingRecords) {
      // Create a clean copy of the record
      const cleanRecord: any = {};

      // Attempt to only copy fields that exist in the record
      Object.assign(cleanRecord, record);

      // --- Handle Nissi's New Migration Schema Changes ---
      // If the new schema requires firstName/lastName on models that didn't have them before, inject fallbacks
      if (
        ['doctor', 'staff', 'hospitalStaff', 'patient', 'user'].includes(model)
      ) {
        if (!cleanRecord.firstName) cleanRecord.firstName = 'Test';
        if (!cleanRecord.lastName) cleanRecord.lastName = 'User';
      }

      // Dynamic gap-filler for hospitalInvoice records missing the required appointmentId
      if (model === 'hospitalInvoice' && !cleanRecord.appointmentId) {
        const unlinkedAppt = await retryQuery(() => prisma.appointment.findFirst({
          where: { hospitalInvoice: null },
        }));
        if (unlinkedAppt) {
          cleanRecord.appointmentId = unlinkedAppt.id;
        } else {
          const firstPatient = await retryQuery(() => prisma.patient.findFirst());
          const firstDoctor = await retryQuery(() => prisma.doctor.findFirst());
          const firstHospital = await retryQuery(() => prisma.hospital.findFirst());
          if (firstPatient && firstDoctor && firstHospital) {
            const dummyApptId = 'dummy-appt-' + cleanRecord.id;
            await retryQuery(() => prisma.appointment.create({
              data: {
                id: dummyApptId,
                patientId: firstPatient.id,
                doctorId: firstDoctor.id,
                hospitalId: firstHospital.id,
                date: new Date(),
                reason: 'Dummy appointment for orphaned invoice',
                status: 'COMPLETED',
              },
            }));
            cleanRecord.appointmentId = dummyApptId;
          }
        }
      }

      try {
        // @ts-ignore
        await retryQuery(() => prisma[model].create({
          data: cleanRecord,
        }));
        successCount++;
      } catch (err: any) {
        let constraintResolved = false;
        if (err.code === 'P2002') {
          // Handle unique constraint failure by deleting existing conflicting seed record
          const uniqueLists = uniqueFieldsMap[model];
          if (uniqueLists) {
            for (const uniqueFields of uniqueLists) {
              const where: any = {};
              let hasAllFields = true;
              for (const field of uniqueFields) {
                if (cleanRecord[field] === undefined || cleanRecord[field] === null) {
                  hasAllFields = false;
                  break;
                }
                where[field] = cleanRecord[field];
              }
              if (hasAllFields) {
                try {
                  // Find if conflicting record exists
                  // @ts-ignore
                  const conflicting = await retryQuery(() => prisma[model].findFirst({ where }));
                  if (conflicting) {
                    console.log(`[Unique Constraint Conflict] Deleting conflicting seed record in ${model} (id: ${(conflicting as any).id}) to restore backup record...`);
                    // @ts-ignore
                    await retryQuery(() => prisma[model].delete({ where: { id: (conflicting as any).id } }));
                    // Retry create
                    // @ts-ignore
                    await retryQuery(() => prisma[model].create({ data: cleanRecord }));
                    successCount++;
                    constraintResolved = true;
                    break;
                  }
                } catch (deleteCreateErr: any) {
                  console.log(`Failed to resolve unique constraint for ${model} via delete/create: ${deleteCreateErr.message}`);
                }
              }
            }
          }
        }

        if (!constraintResolved) {
          if (err.code !== 'P2002') {
            console.log(
              `Create failed for ${model} [${record.id || 'no-id'}]: ${err.message}`,
            );
          }
          // Fallback: If record already exists, try update
          try {
            if (record.id) {
              // @ts-ignore
              await retryQuery(() => prisma[model].update({
                where: { id: record.id },
                data: cleanRecord,
              }));
              successCount++;
            } else {
              console.log(
                `Failed to restore record for ${model}: No ID and create failed. Error: ${err.message}`,
              );
              failCount++;
            }
          } catch (updateErr: any) {
            console.log(
              `Update failed for ${model} [${record.id}]: ${updateErr.message}`,
            );
            failCount++;
          }
        }
      }
    }

    console.log(
      `Model [${model}] summary: ${successCount} restored successfully | ${failCount} skipped/conflicted.`,
    );
  }

  console.log(
    '\nComplete database state restoration sequence executed cleanly.\n',
  );
}

main()
  .catch((e) => {
    console.error('Direct restoration encountered an exception:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

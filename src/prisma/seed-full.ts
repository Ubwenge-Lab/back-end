import { PrismaClient, UserRole, PharmacyStatus, BranchStatus, OrderStatus, OrderType, PaymentMethod, PaymentStatus, AppointmentStatus, StaffStatus, NotificationType } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const HASH_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Test@1234';

// Kigali Coordinates Approximation (Latitude: -1.97 to -1.90, Longitude: 30.03 to 30.15)
function getKigaliCoordinates() {
  return {
    latitude: faker.location.latitude({ max: -1.90, min: -1.97, precision: 4 }),
    longitude: faker.location.longitude({ max: 30.15, min: 30.03, precision: 4 })
  };
}

async function main() {
  console.log('🌱 Starting full database seed with Faker...');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);

  console.log('🧹 Cleaning existing data...');
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.hospitalPayment.deleteMany(),
    prisma.hospitalInvoiceItem.deleteMany(),
    prisma.hospitalInvoice.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.prescriptionMedication.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.hospitalPatientRegistration.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.staffPermissions.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.staff.deleteMany(),
    prisma.doctorSchedule.deleteMany(),
    prisma.doctor.deleteMany(),
    prisma.hospitalStaff.deleteMany(),
    prisma.hospitalDrugStock.deleteMany(),
    prisma.hospital.deleteMany(),
    prisma.stockTransferItem.deleteMany(),
    prisma.stockTransfer.deleteMany(),
    prisma.medication.deleteMany(),
    prisma.medicationRegistry.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.pharmacy.deleteMany(),
    prisma.user.deleteMany({ where: { role: { not: UserRole.SUPER_ADMIN } } }),
  ]);

  // --- 1. Super Admin Setup ---
  console.log('👤 Seeding Super Admin...');
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@evuze.rw';
  const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, HASH_ROUNDS)
    : passwordHash;

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: UserRole.SUPER_ADMIN, isVerified: true, isActive: true },
    create: {
      email: ADMIN_EMAIL,
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      password: ADMIN_PASSWORD,
      isActive: true,
      firstName: 'Super',
      lastName: 'Admin'
    },
  });

  // --- 2. Pharmacies & Branches ---
  console.log('🏥 Seeding Pharmacies & Branches...');
  const pharmacies = [];
  const branches = [];
  const pharmacyStaff = [];

  for (let i = 0; i < 5; i++) {
    const ownerEmail = `owner${i + 1}@pharmacy.com`;
    const owner = await prisma.user.upsert({
      where: { email: ownerEmail },
      update: {},
      create: { email: ownerEmail, role: UserRole.PHARMACY, isVerified: true, password: passwordHash, firstName: faker.person.firstName(), lastName: faker.person.lastName() }
    });

    const coords = getKigaliCoordinates();
    const pharmacy = await prisma.pharmacy.create({
      data: {
        userId: owner.id,
        name: faker.company.name() + ' Pharmacy',
        phone: '+250788' + faker.string.numeric(6),
        address: faker.location.streetAddress() + ', Kigali',
        latitude: coords.latitude,
        longitude: coords.longitude,
        status: PharmacyStatus.APPROVED,
        approvedAt: new Date(),
      }
    });
    pharmacies.push(pharmacy);

    // Create 2 branches per pharmacy
    for (let j = 0; j < 2; j++) {
      const branchManagerEmail = `manager${i}_${j}@pharmacy.com`;
      const manager = await prisma.user.upsert({
        where: { email: branchManagerEmail },
        update: {},
        create: { email: branchManagerEmail, role: UserRole.BRANCH_MANAGER, isVerified: true, password: passwordHash, firstName: faker.person.firstName(), lastName: faker.person.lastName() }
      });

      const bCoords = getKigaliCoordinates();
      const branch = await prisma.branch.create({
        data: {
          pharmacyId: pharmacy.id,
          managerId: manager.id,
          name: pharmacy.name + ' - Branch ' + (j + 1),
          address: faker.location.streetAddress() + ', Kigali',
          phone: '+250788' + faker.string.numeric(6),
          latitude: bCoords.latitude,
          longitude: bCoords.longitude,
          status: BranchStatus.APPROVED,
          branchStatus: BranchStatus.APPROVED,
          isActive: true
        }
      });
      branches.push(branch);

      // Create Pharmacist and Cashier for Branch
      const pharmacistUser = await prisma.user.create({
        data: { email: `pharmacist${i}_${j}@pharmacy.com`, role: UserRole.PHARMACIST, isVerified: true, password: passwordHash }
      });
      const pharmacist = await prisma.staff.create({
        data: { userId: pharmacistUser.id, branchId: branch.id, firstName: faker.person.firstName(), lastName: faker.person.lastName(), status: StaffStatus.ACTIVE }
      });

      const cashierUser = await prisma.user.create({
        data: { email: `cashier${i}_${j}@pharmacy.com`, role: UserRole.CASHIER, isVerified: true, password: passwordHash }
      });
      const cashier = await prisma.staff.create({
        data: { userId: cashierUser.id, branchId: branch.id, firstName: faker.person.firstName(), lastName: faker.person.lastName(), status: StaffStatus.ACTIVE }
      });
      
      pharmacyStaff.push(pharmacist, cashier);

      await prisma.staffPermissions.create({ data: { staffId: pharmacist.id, permissions: ['MANAGE_INVENTORY', 'DISPENSE_MEDS'] } });
      await prisma.staffPermissions.create({ data: { staffId: cashier.id, permissions: ['PROCESS_PAYMENTS'] } });
    }
  }

  // --- 3. Hospitals & Doctors ---
  console.log('🏥 Seeding Hospitals & Doctors...');
  const hospitals = [];
  const doctors = [];
  const hospitalStaffList = [];

  for (let i = 0; i < 3; i++) {
    const adminEmail = `hospitaladmin${i + 1}@hospital.com`;
    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, role: UserRole.HOSPITAL_ADMIN, isVerified: true, password: passwordHash, firstName: faker.person.firstName(), lastName: faker.person.lastName() }
    });

    const hCoords = getKigaliCoordinates();
    const hospital = await prisma.hospital.create({
      data: {
        userId: adminUser.id,
        name: faker.company.name() + ' Hospital',
        address: faker.location.streetAddress() + ', Kigali',
        phone: '+250788' + faker.string.numeric(6),
        latitude: hCoords.latitude,
        longitude: hCoords.longitude,
      }
    });
    hospitals.push(hospital);

    // Hospital Staff (Nurse/Receptionist)
    for (let j = 0; j < 3; j++) {
      const hStaffUser = await prisma.user.create({
        data: { email: `nurse${i}_${j}@hospital.com`, role: UserRole.NURSE, isVerified: true, password: passwordHash }
      });
      const hStaff = await prisma.hospitalStaff.create({
        data: { userId: hStaffUser.id, hospitalId: hospital.id, firstName: faker.person.firstName(), lastName: faker.person.lastName(), status: StaffStatus.ACTIVE }
      });
      hospitalStaffList.push(hStaff);
    }

    // Doctors
    for (let j = 0; j < 5; j++) {
      const docUser = await prisma.user.create({
        data: { email: `doctor${i}_${j}@hospital.com`, role: UserRole.DOCTOR, isVerified: true, password: passwordHash }
      });
      const doctor = await prisma.doctor.create({
        data: {
          userId: docUser.id,
          hospitalId: hospital.id,
          specialization: faker.helpers.arrayElement(['Cardiology', 'Pediatrics', 'General Practice', 'Orthopedics', 'Dermatology']),
          licenseNumber: 'RW-MED-' + faker.string.numeric(5),
          isAvailable: true,
          bio: faker.person.bio(),
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName()
        }
      });
      doctors.push(doctor);

      // Doctor Schedules
      const days = [1, 2, 3, 4, 5]; // Mon-Fri
      for (const day of days) {
        await prisma.doctorSchedule.create({
          data: { doctorId: doctor.id, dayOfWeek: day, startTime: '08:00', endTime: '17:00' }
        });
      }
    }
  }

  // --- 4. Patients ---
  console.log('🧑‍🤝‍🧑 Seeding Patients...');
  const patients = [];
  for (let i = 0; i < 50; i++) {
    const patientUser = await prisma.user.create({
      data: { email: `patient${i + 1}@patient.com`, role: UserRole.PATIENT, isVerified: true, password: passwordHash, firstName: faker.person.firstName(), lastName: faker.person.lastName() }
    });
    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        firstName: patientUser.firstName!,
        lastName: patientUser.lastName!,
        phone: '+250788' + faker.string.numeric(6),
        address: faker.location.streetAddress() + ', Kigali',
        mrn: 'MRN-' + faker.string.numeric(6),
        nationalId: faker.string.numeric(16),
        insuranceProvider: faker.helpers.arrayElement(['RSSB', 'MMI', 'RADIANT', null]),
        insuranceCoverage: faker.helpers.arrayElement([0, 50, 80, 100])
      }
    });
    patients.push(patient);

    // Register Patient at random hospital
    await prisma.hospitalPatientRegistration.create({
      data: {
        patientId: patient.id,
        hospitalId: faker.helpers.arrayElement(hospitals).id,
        mrn: patient.mrn!
      }
    });
  }

  // --- 5. Medications & Drug Stock ---
  console.log('💊 Seeding Medications & Drug Stock...');
  
  console.log('📝 Seeding Medication Registry from CSV file...');
  const csvFilePath = path.join(__dirname, '../../medication-registry.csv');
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found at: ${csvFilePath}`);
    process.exit(1);
  }

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
    if (quoteCount % 2 !== 0) {
      continue;
    }

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

      const regDate = parseDate(regDateStr);
      const expDate = parseDate(expDateStr);

      const record = {
        registrationNumber: registrationNumber,
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
        registrationDate: regDate,
        expiryDate: expDate,
      };

      if (!seenRegNos.has(record.registrationNumber)) {
        seenRegNos.add(record.registrationNumber);
        registryRecords.push(record);
      }
    } catch (error) {
      // Ignore row error
    }
    csvRowCount++;
  }

  console.log(`📥 Bulk importing ${registryRecords.length} records into medication_registry...`);
  await prisma.medicationRegistry.createMany({
    data: registryRecords,
    skipDuplicates: true,
  });

  const registryItems = await prisma.medicationRegistry.findMany();
  const registryIds = registryItems.map(r => r.id);
  const medications = [];
  const baseMeds = ['Amoxicillin', 'Paracetamol', 'Ibuprofen', 'Cetirizine', 'Omeprazole', 'Metformin', 'Amlodipine'];

  for (const branch of branches) {
    for (let i = 0; i < 10; i++) {
      const isRegistryLinked = registryIds.length > 0 && Math.random() > 0.5;
      const regItem = isRegistryLinked ? faker.helpers.arrayElement(registryItems) : null;
      
      const med = await prisma.medication.create({
        data: {
          branchId: branch.id,
          pharmacyId: branch.pharmacyId,
          registryId: isRegistryLinked ? regItem?.id : null,
          name: isRegistryLinked ? regItem!.brandName : faker.helpers.arrayElement(baseMeds) + ' ' + faker.string.numeric(2) + '0mg',
          price: parseFloat(faker.commerce.price({ min: 500, max: 15000 })),
          quantity: faker.number.int({ min: 5, max: 200 }),
          requiresPrescription: faker.datatype.boolean()
        }
      });
      medications.push(med);
    }
  }

  for (const hospital of hospitals) {
    // Pick 5 unique random registry items to avoid duplicate composite key [drugId, hospitalId]
    const selectedRegistryItems = faker.helpers.arrayElements(registryItems, 5);
    for (const regItem of selectedRegistryItems) {
      await prisma.hospitalDrugStock.create({
        data: {
          hospitalId: hospital.id,
          drugId: regItem.id,
          unitPrice: parseFloat(faker.commerce.price({ min: 500, max: 15000 })),
          quantity: faker.number.int({ min: 20, max: 500 }),
          expiryDate: faker.date.future({ years: 2 })
        }
      });
    }
  }

  // --- 6. Appointments & Prescriptions ---
  console.log('📅 Seeding Appointments & Prescriptions...');
  for (let i = 0; i < 50; i++) {
    const patient = faker.helpers.arrayElement(patients);
    const doctor = faker.helpers.arrayElement(doctors);
    const isPast = faker.datatype.boolean();
    
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        hospitalId: doctor.hospitalId,
        date: isPast ? faker.date.recent({ days: 30 }) : faker.date.soon({ days: 14 }),
        status: isPast ? AppointmentStatus.COMPLETED : AppointmentStatus.SCHEDULED,
        reason: 'General Consultation'
      }
    });

    if (isPast) {
      // Create Invoice
      const invoice = await prisma.invoice.create({
        data: {
          hospitalId: doctor.hospitalId,
          patientId: patient.id,
          totalAmount: 15000,
          status: 'PAID',
          dueDate: faker.date.recent({ days: 10 })
        }
      });

      await prisma.invoiceItem.create({
        data: { invoiceId: invoice.id, description: 'Consultation Fee', quantity: 1, unitPrice: 15000, subtotal: 15000 }
      });

      await prisma.hospitalPayment.create({
        data: { invoiceId: invoice.id, patientId: patient.id, amount: 15000, method: PaymentMethod.MTN_MOMO, status: PaymentStatus.COMPLETED }
      });

      // Create Prescription
      if (Math.random() > 0.3) {
        const prescription = await prisma.prescription.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            appointmentId: appointment.id,
            diagnosis: 'Common Cold',
            status: 'APPROVED'
          }
        });

        await prisma.prescriptionMedication.create({
          data: {
            prescriptionId: prescription.id,
            medicationName: faker.helpers.arrayElement(baseMeds),
            dosage: '1 tablet',
            frequency: 'Twice a day',
            duration: '5 days'
          }
        });
      }
    }
  }

  // --- 7. Orders & Payments ---
  console.log('📦 Seeding Orders & Payments...');
  for (let i = 0; i < 150; i++) {
    const patient = faker.helpers.arrayElement(patients);
    const branch = faker.helpers.arrayElement(branches);
    
    // Pick 1-3 random medications from this branch
    const branchMeds = medications.filter(m => m.branchId === branch.id);
    if (branchMeds.length === 0) continue;
    
    const orderMeds = faker.helpers.arrayElements(branchMeds, { min: 1, max: 3 });
    const total = orderMeds.reduce((sum, m) => sum + m.price, 0);

    const order = await prisma.order.create({
      data: {
        patientId: patient.id,
        pharmacyId: branch.pharmacyId,
        branchId: branch.id,
        total: total,
        status: faker.helpers.arrayElement([OrderStatus.PENDING, OrderStatus.COMPLETED, OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
        type: faker.helpers.arrayElement([OrderType.DELIVERY, OrderType.PICKUP]),
        paymentMethod: PaymentMethod.MTN_MOMO,
        subtotal: total,
        deliveryFee: 1500
      }
    });

    for (const med of orderMeds) {
      await prisma.orderItem.create({
        data: { orderId: order.id, medicationId: med.id, quantity: 1, price: med.price }
      });
    }

    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.DELIVERED) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: total + 1500, // including delivery fee
          paymentMethod: PaymentMethod.MTN_MOMO,
          status: PaymentStatus.COMPLETED,
          transactionId: 'TXN-' + faker.string.uuid()
        }
      });
    }
  }

  // --- 8. Miscellaneous (Transfers, Attendance, Cart, Notifications) ---
  console.log('🔄 Seeding Misc (Transfers, Attendance, Notifications)...');
  
  if (branches.length >= 2) {
    const transfer = await prisma.stockTransfer.create({
      data: {
        fromBranchId: branches[0].id,
        toBranchId: branches[1].id,
        status: 'COMPLETED'
      }
    });

    const b0Meds = medications.filter(m => m.branchId === branches[0].id);
    if (b0Meds.length > 0) {
      await prisma.stockTransferItem.create({
        data: { transferId: transfer.id, medicationId: b0Meds[0].id, quantity: 10 }
      });
    }
  }

  // Carts
  for (let i = 0; i < 10; i++) {
    const patient = faker.helpers.arrayElement(patients);
    const med = faker.helpers.arrayElement(medications);
    await prisma.cartItem.create({
      data: { patientId: patient.id, pharmacyId: med.pharmacyId!, medicationId: med.id, quantity: 2 }
    });
  }

  // Notifications
  for (let i = 0; i < 20; i++) {
    const user = faker.helpers.arrayElement(patients).userId;
    await prisma.notification.create({
      data: {
        userId: user,
        type: NotificationType.ORDER_PLACED,
        title: 'New Update',
        message: 'You have a new update regarding your interaction.',
      }
    });
  }

  console.log('✅ Full Database Seed Completed Successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

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

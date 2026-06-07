// backend/src/prisma/seed-claims.ts

import { PrismaClient, AppointmentStatus, HospitalBillingStatus, ClaimStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting Claims and Invoices seeding...');

    // 1. Fetch an existing hospital, patient, and doctor
    const hospital = await prisma.hospital.findFirst();
    const patient = await prisma.patient.findFirst();

    if (!hospital || !patient) {
        console.error('❌ Error: Could not find any hospitals or patients. Please run the full database seed first:');
        console.error('   npx ts-node src/prisma/seed-full.ts');
        process.exit(1);
    }

    const doctor = await prisma.doctor.findFirst({
        where: { hospitalId: hospital.id },
    });

    if (!doctor) {
        console.error(`❌ Error: Could not find any doctors for hospital ${hospital.name}. Please seed first.`);
        process.exit(1);
    }

    console.log(`🏥 Found Hospital: ${hospital.name}`);
    console.log(`🧑 Found Patient: ${patient.firstName} ${patient.lastName} (MRN: ${patient.mrn})`);
    console.log(`🥼 Found Doctor: Dr. ${doctor.firstName} ${doctor.lastName}`);

    // Clean up any existing claims/invoices created by this script before to avoid duplicate constraint violations
    // (Optional: useful if you run the script multiple times)
    console.log('🧹 Cleaning old test claims and invoices...');
    const oldClaims = await prisma.insuranceClaim.findMany({
        where: { provider: { in: ['RSSB-Test', 'MMI-Test', 'Sanlam-Test'] } }
    });

    if (oldClaims.length > 0) {
        const invoiceIds = oldClaims.map(c => c.invoiceId);
        await prisma.insuranceClaim.deleteMany({
            where: { id: { in: oldClaims.map(c => c.id) } }
        });
        await prisma.hospitalInvoiceItem.deleteMany({
            where: { invoiceId: { in: invoiceIds } }
        });
        await prisma.hospitalInvoice.deleteMany({
            where: { id: { in: invoiceIds } }
        });
    }

    // 2. Define the test claims we want to generate
    const testClaimsData = [
        { provider: 'RSSB-Test', amount: 15000, desc: 'Consultation & Triage Vitals' },
        { provider: 'MMI-Test', amount: 35000, desc: 'Dental Surgery & Post-Op Medications' },
        { provider: 'Sanlam-Test', amount: 8000, desc: 'Pediatric General Checkup' }
    ];

    console.log('🚀 Generating test Appointments, Invoices, and pending Insurance Claims...');

    for (const item of testClaimsData) {
        // A. Create a completed appointment
        const appointment = await prisma.appointment.create({
            data: {
                patientId: patient.id,
                doctorId: doctor.id,
                hospitalId: hospital.id,
                date: new Date(),
                status: AppointmentStatus.COMPLETED,
                reason: item.desc,
            },
        });

        // B. Create a HospitalInvoice with 'INSURANCE_PENDING' status
        const invoice = await prisma.hospitalInvoice.create({
            data: {
                hospitalId: hospital.id,
                patientId: patient.id,
                appointmentId: appointment.id,
                totalAmount: item.amount,
                paymentStatus: HospitalBillingStatus.INSURANCE_PENDING,
                insuranceCovered: true,
                items: {
                    create: {
                        description: item.desc,
                        quantity: 1,
                        unitCost: item.amount,
                        subtotal: item.amount,
                    }
                }
            }
        });

        // C. Create a corresponding InsuranceClaim record linked to this invoice
        const claim = await prisma.insuranceClaim.create({
            data: {
                invoiceId: invoice.id,
                provider: item.provider,
                claimAmount: item.amount,
                settledAmount: 0,
                difference: 0,
                status: ClaimStatus.PENDING,
            }
        });

        console.log(`✅ Seeded Pending Claim for ${item.provider}: ${item.amount} RWF (Claim ID: ${claim.id})`);
    }

    console.log('🎉 Seeding Claims successfully completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Starting Database Flush for E2E Test Data...');

  try {
    // We run this inside a transaction to ensure everything deletes perfectly or nothing deletes at all
    await prisma.$transaction(async (tx) => {
      // 1. Delete Financials & Pharmacy Orders
      const deletedInvoices = await tx.invoice.deleteMany();
      const deletedOrders = await tx.order.deleteMany();
      
      // 2. Delete Clinical Records (Prescriptions, Diagnostics, Admissions)
      const deletedPrescriptions = await tx.prescription.deleteMany();
      const deletedDiagnostics = await tx.diagnosticOrder.deleteMany();
      const deletedAdmissions = await tx.inpatientAdmission.deleteMany();
      
      // 3. Delete Appointments (The starting point of the queue)
      const deletedAppointments = await tx.appointment.deleteMany();

      console.log(`✅ Flushed ${deletedInvoices.count} Invoices`);
      console.log(`✅ Flushed ${deletedOrders.count} Pharmacy Orders`);
      console.log(`✅ Flushed ${deletedPrescriptions.count} Prescriptions`);
      console.log(`✅ Flushed ${deletedDiagnostics.count} Diagnostic Orders`);
      console.log(`✅ Flushed ${deletedAdmissions.count} Admissions`);
      console.log(`✅ Flushed ${deletedAppointments.count} Appointments`);
    });

    console.log('🚀 Database is completely clean and ready for the E2E Smoke Test!');
  } catch (error) {
    console.error('❌ Failed to flush database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

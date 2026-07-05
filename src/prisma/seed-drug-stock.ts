import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const kfhId  = '50000000-0000-0000-0000-000000000001';
const chukId = '50000000-0000-0000-0000-000000000002';

const STOCK_ENTRIES = [
  { qty: 150, reorder: 20, unitPrice: 2500, daysUntilExpiry: 540 },
  { qty: 8,   reorder: 15, unitPrice: 4800, daysUntilExpiry: 45  },
  { qty: 200, reorder: 30, unitPrice: 1200, daysUntilExpiry: 730 },
  { qty: 0,   reorder: 10, unitPrice: 900,  daysUntilExpiry: -5  },
  { qty: 75,  reorder: 10, unitPrice: 6500, daysUntilExpiry: 400 },
  { qty: 12,  reorder: 25, unitPrice: 3200, daysUntilExpiry: 55  },
  { qty: 320, reorder: 50, unitPrice: 750,  daysUntilExpiry: 600 },
  { qty: 5,   reorder: 10, unitPrice: 11000,daysUntilExpiry: 365 },
  { qty: 90,  reorder: 15, unitPrice: 2100, daysUntilExpiry: 800 },
  { qty: 45,  reorder: 20, unitPrice: 5500, daysUntilExpiry: 180 },
  { qty: 18,  reorder: 30, unitPrice: 3800, daysUntilExpiry: 30  },
  { qty: 110, reorder: 10, unitPrice: 1600, daysUntilExpiry: 900 },
];

async function main() {
  const drugs = await prisma.medicationRegistry.findMany({ take: 12 });
  console.log(`Found ${drugs.length} registry drugs`);

  if (drugs.length === 0) {
    console.log('No MedicationRegistry entries — run the full seed first to populate the registry.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < drugs.length; i++) {
    const drug  = drugs[i];
    const entry = STOCK_ENTRIES[i % STOCK_ENTRIES.length];
    const expiryDate = new Date(Date.now() + entry.daysUntilExpiry * 24 * 60 * 60 * 1000);

    for (const hospitalId of [kfhId, chukId]) {
      const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!hospital) { console.log(`  ⚠️  Hospital ${hospitalId} not found, skipping`); continue; }

      const result = await prisma.hospitalDrugStock.upsert({
        where: { drugId_hospitalId: { drugId: drug.id, hospitalId } },
        update: {},
        create: { drugId: drug.id, hospitalId, quantity: entry.qty, reorderLevel: entry.reorder, unitPrice: entry.unitPrice, expiryDate },
      });

      if ((result as any)._count === undefined) {
        created++;
        console.log(`  ✅ ${hospital.name}: ${drug.brandName} (qty=${entry.qty})`);
      } else {
        skipped++;
      }
    }
  }

  console.log(`\nDone — ${created + skipped * 0} entries upserted for ${drugs.length} drugs across 2 hospitals.`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

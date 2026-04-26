import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verifying Registry Data...');

  // 1. Count Total
  const count = await prisma.medicationRegistry.count();
  console.log(`✅ Total Records: ${count}`);

  if (count === 0) {
    console.error('❌ No records found! Seed failed.');
    return;
  }

  // 2. Sample Search (e.g., "Paracetamol")
  const query = 'Paracetamol';
  console.log(`\n🔎 Searching for "${query}"...`);
  const searchResults = await prisma.medicationRegistry.findMany({
    where: {
      OR: [
        { brandName: { contains: query, mode: 'insensitive' } },
        { genericName: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 3,
  });

  if (searchResults.length > 0) {
    console.log(`✅ Found ${searchResults.length} matches. Examples:`);
    searchResults.forEach((m) =>
      console.log(
        `   - ${m.brandName} (${m.genericName}) [${m.dosageStrength}]`,
      ),
    );
  } else {
    console.log(`⚠️ No matches for "${query}". Trying random sample...`);
  }

  // 3. Random Sample
  console.log('\n🎲 Random 5 Records:');
  const allIds = await prisma.medicationRegistry.findMany({
    select: { id: true },
    take: 100,
  });

  // Pick 5 random
  const randomIds = allIds
    .sort(() => 0.5 - Math.random())
    .slice(0, 5)
    .map((i) => i.id);

  const randomRecords = await prisma.medicationRegistry.findMany({
    where: { id: { in: randomIds } },
  });

  randomRecords.forEach((r) => {
    console.log(`
    --------------------------------------------------
    🆔 Registration No: ${r.registrationNumber}
    💊 Brand: ${r.brandName}
    🧬 Generic: ${r.genericName}
    🏭 Manufacturer: ${r.manufacturerName} (${r.manufacturerCountry})
    📅 Expiry: ${r.expiryDate ? r.expiryDate.toISOString().split('T')[0] : 'N/A'}
    --------------------------------------------------`);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());

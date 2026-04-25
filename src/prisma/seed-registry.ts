import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function main() {
  const csvFilePath = path.join(__dirname, '../../medication_registry.csv');

  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found at: ${csvFilePath}`);
    console.log(
      'Please place "medication_registry.csv" in the back-end root folder.',
    );
    process.exit(1);
  }

  console.log(`📖 Reading CSV file from: ${csvFilePath}`);

  const fileStream = fs.createReadStream(csvFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let rowCount = 0;
  let successCount = 0;
  let errorCount = 0;

  let lineBuffer = '';
  const insideQuotes = false;

  for await (const line of rl) {
    if (lineBuffer) {
      lineBuffer += '\n' + line;
    } else {
      lineBuffer = line;
    }

    // Check if quotes are balanced in the buffer
    // Count occurrences of "
    // Note: Escaped quotes are "" which is 2 quotes, so it doesn't affect parity.
    const quoteCount = (lineBuffer.match(/"/g) || []).length;

    // If odd number of quotes, we are inside a multiline quoted field
    if (quoteCount % 2 !== 0) {
      continue; // Read next line
    }

    // Buffer is a complete record
    const recordText = lineBuffer;
    lineBuffer = ''; // Reset buffer

    // Skip empty lines (unlikely with this logic but good safeguard)
    if (!recordText.trim()) continue;

    const columns = parseCSVLine(recordText);

    if (rowCount === 0) {
      headers = columns.map((h) => h.toLowerCase().trim());
      console.log('📝 Headers found:', headers);
      rowCount++;
      continue;
    }

    try {
      const getVal = (index: number, ...possibleHeaders: string[]) => {
        for (const ph of possibleHeaders) {
          const foundIdx = headers.findIndex((h) =>
            h.includes(ph.toLowerCase()),
          );
          if (foundIdx !== -1 && columns[foundIdx])
            return columns[foundIdx].trim();
        }
        return columns[index] ? columns[index].trim() : '';
      };

      const registrationNumber = getVal(1, 'registration no');

      // Skip if no registration number
      if (!registrationNumber) continue;

      // Parse dates safely (handle "2025-11-14\nGrace Period")
      const cleanDate = (str: string) => {
        if (!str) return undefined;
        // Take first line, trim
        const firstPart = str.split('\n')[0].trim();
        // Remove trailing quotes or text if accidental
        return firstPart;
      };

      const regDateStr = cleanDate(getVal(14, 'registration date'));
      const expDateStr = cleanDate(getVal(15, 'expiry date'));

      // Skip invalid dates - use current date as fallback or handle error?
      // Schema likely requires valid dates.
      // If date is invalid, we'll try to parse it, if fail, use default (or maybe skip record?)
      // Let's use a safe default but log it.

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

      await prisma.medicationRegistry.upsert({
        where: { registrationNumber: record.registrationNumber },
        update: record,
        create: record,
      });

      successCount++;
      if (successCount % 100 === 0) {
        process.stdout.write(`\r✅ Processed ${successCount} records...`);
      }
    } catch (error) {
      console.error(
        `\n❌ Error processing row ${rowCount} (${columns[0]}):`,
        error,
      );
      errorCount++;
    }

    rowCount++;
  }

  console.log(`\n\n✨ Import Completed!`);
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`❌ Failed rows: ${errorCount}`);
  console.log(`📊 Total rows processed: ${rowCount}`);
}

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
        // REMOVED semicolon support!
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
      // Fallback or log?
      // Let's treat today as fallback for now
      // console.warn(`Invalid Date found: ${dateStr}, using NOW`);
      return new Date();
    }
    return d;
  } catch (e) {
    return new Date();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

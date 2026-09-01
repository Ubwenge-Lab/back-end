import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

const EMAILS = [
  'admin@kingfaisal.com',
  'admin@chuk.com',
  'robert@chuk.com',
  'eric@kingfaisal.com',
];

async function main() {
  const hash = await bcrypt.hash('Test@1234', 10);
  for (const email of EMAILS) {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { password: hash },
    });
    console.log(`${email}: updated ${result.count} record(s)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

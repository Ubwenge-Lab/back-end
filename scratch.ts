import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const usersById = await prisma.user.findMany({
    where: {
      id: {
        startsWith: '00000000-0000-0000-0002'
      }
    }
  });
  console.log("Existing users by ID:", usersById.map((u: any) => ({ id: u.id, email: u.email })));
}

run().finally(() => prisma.$disconnect());

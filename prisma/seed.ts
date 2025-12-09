// backend/prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Check if super admin already exists
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });

  if (existingSuperAdmin) {
    console.log('✅ Super Admin already exists. Skipping seed.');
    return;
  }

  // Get super admin credentials from environment
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@evuze.rw';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2025';

  // Hash password
  const hashedPassword = await bcrypt.hash(superAdminPassword, 10);

  // Create Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      email: superAdminEmail,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });

  console.log('✅ Super Admin created:');
  console.log(`   Email: ${superAdminEmail}`);
  console.log(`   Password: ${superAdminPassword}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the password after first login!');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
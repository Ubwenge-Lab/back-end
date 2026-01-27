// backend/src/prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

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
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'danielntwali9@gmail.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdminPower@2025';

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

  console.log('✅ Super Admin created successfully!');
  console.log('');
  console.log('📧 Email:', superAdminEmail);
  console.log('🔑 Password:', superAdminPassword);
  console.log('');
  console.log('⚠️  IMPORTANT SECURITY NOTICE:');
  console.log('   1. On first login, you will be prompted to change your password');
  console.log('   2. Use the PUT /auth/change-password endpoint after logging in');
  console.log('   3. The system detects first login by comparing with the default password');
  console.log('');
  console.log('📝 Login Instructions:');
  console.log('   1. POST /auth/login with email and password');
  console.log('   2. If requiresPasswordChange: true, immediately call PUT /auth/change-password');
  console.log('   3. Provide currentPassword (default) and newPassword');
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
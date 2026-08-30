import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemAdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const auditLogCount = await this.prisma.auditLog.count({
      where: {
        createdAt: {
          gte: today,
        },
      },
    });

    return {
      systemUptime: process.uptime(),
      activeErrors: 0, // Mocked for now, as Sentry data requires Sentry API key to fetch active issues
      auditLogsToday: auditLogCount,
    };
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        firstName: true,
        lastName: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users;
  }
}

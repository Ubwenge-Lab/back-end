import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService', () => {
  let service: SystemAdminService;
  let prisma: {
    auditLog: { count: jest.Mock };
    user: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      auditLog: { count: jest.fn() },
      user: { findMany: jest.fn() },
    };
    service = new SystemAdminService(prisma as any);
  });

  describe('getDashboardStats', () => {
    it('returns uptime, mocked activeErrors, and today\'s audit log count', async () => {
      prisma.auditLog.count.mockResolvedValue(7);

      const stats = await service.getDashboardStats();

      expect(stats.auditLogsToday).toBe(7);
      expect(stats.activeErrors).toBe(0);
      expect(typeof stats.systemUptime).toBe('number');
      // The count query filters to today's start.
      const countArgs = prisma.auditLog.count.mock.calls[0][0];
      const gte = (countArgs.where.createdAt as any).gte as Date;
      const now = new Date();
      expect(gte.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe('getAllUsers', () => {
    it('returns users with the admin-facing select shape, newest first', async () => {
      const rows = [
        {
          id: 'u1',
          email: 'a@x.rw',
          role: 'SYSTEM_ADMIN',
          isActive: true,
          isVerified: true,
          createdAt: new Date('2026-08-30'),
          firstName: 'Robert',
          lastName: 'Niyonkuru',
        },
        {
          id: 'u2',
          email: 'b@x.rw',
          role: 'PATIENT',
          isActive: false,
          isVerified: false,
          createdAt: new Date('2026-08-01'),
          firstName: null,
          lastName: null,
        },
      ];
      prisma.user.findMany.mockResolvedValue(rows);

      const users = await service.getAllUsers();

      expect(users).toHaveLength(2);
      expect(users[0].email).toBe('a@x.rw');
      const findArgs = prisma.user.findMany.mock.calls[0][0];
      expect(findArgs.orderBy.createdAt).toBe('desc');
      // Never expose the password hash from the admin user list.
      expect(findArgs.select).not.toHaveProperty('password');
      expect(findArgs.select).toHaveProperty('email');
      expect(findArgs.select).toHaveProperty('role');
      expect(findArgs.select).toHaveProperty('isActive');
    });
  });
});

import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class NursesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    // 1. Fetch the nurse's staff profile to isolate data to their specific hospital
    const staff = await this.prisma.hospitalStaff.findUnique({
      where: { userId },
    });

    if (!staff) {
      throw new ForbiddenException('Nurse profile not found');
    }

    // 2. Establish boundaries for "Today"
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 3. totalPatients: All valid appointments scheduled for today at this hospital
    const totalPatients = await this.prisma.appointment.count({
      where: {
        hospitalId: staff.hospitalId,
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
    });

    // 4. pendingTasks: Patients who have ARRIVED and are waiting for triage vitals
    const pendingTasks = await this.prisma.appointment.count({
      where: {
        hospitalId: staff.hospitalId,
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
        status: AppointmentStatus.ARRIVED, 
      },
    });

    // 5. unreadMessages: Unread system notifications assigned to this specific nurse
    const unreadMessages = await this.prisma.notification.count({
      where: {
        userId: userId,
        isRead: false,
      },
    });

    return {
      totalPatients,
      pendingTasks,
      unreadMessages,
    };
  }
}
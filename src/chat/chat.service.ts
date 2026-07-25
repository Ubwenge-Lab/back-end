import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates if a user (Doctor or Patient) has access to this chat room.
   * Enforces the < 30 days rule for completed appointments.
   */
  async validateChatAccess(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const isPatient = appointment.patient.userId === userId;
    const isDoctor = appointment.doctor.userId === userId;

    if (!isPatient && !isDoctor) {
      throw new ForbiddenException('You are not authorized to access this chat room');
    }

    // Enforce the 30-day chat boundary for completed appointments
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (appointment.status === AppointmentStatus.COMPLETED) {
      if (appointment.date < thirtyDaysAgo) {
        throw new ForbiddenException('Chat is closed. This appointment was completed over 30 days ago.');
      }
    } else if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.NO_SHOW) {
       throw new ForbiddenException('Chat is not available for cancelled or no-show appointments.');
    }

    // Determine the receiver's User ID so the gateway knows who to notify
    const receiverId = isPatient ? appointment.doctor.userId : appointment.patient.userId;

    return { appointment, receiverId };
  }

  /**
   * Persists the chat message to the database
   */
  async saveMessage(appointmentId: string, senderId: string, receiverId: string, content: string) {
    return this.prisma.chatMessage.create({
      data: {
        appointmentId,
        senderId,
        receiverId,
        content,
      },
    });
  }

  /**
   * Retrieves the chat history for a specific appointment
   */
  async getChatHistory(userId: string, appointmentId: string) {
    // Re-use validation to ensure only authorized users fetch history
    await this.validateChatAccess(userId, appointmentId);

    return this.prisma.chatMessage.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'asc' }, // Oldest messages first (standard chat flow)
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
        isRead: true,
      }
    });
  }
}
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSupportTicketDto, userId?: string) {
    try {
      // Generate a unique ticket number: SUP + current timestamp
      // This ensures the number is unique and chronological
      const ticketNumber = `SUP-${Date.now()}`;

      const ticket = await this.prisma.supportTicket.create({
        data: {
          ...dto,
          ticketNumber,
          userId: userId || null, // Link to user if authenticated, else null
        },
      });

      return {
        message: 'Support ticket submitted successfully',
        ticketNumber: ticket.ticketNumber,
        id: ticket.id,
      };
    } catch (error) {
      console.error('Support Ticket Creation Error:', error);
      throw new InternalServerErrorException('Failed to create support ticket');
    }
  }

  async getSettings() {
    let settings = await this.prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
    });

    // Fallback if DB is not seeded
    if (!settings) {
      settings = {
        id: 'singleton',
        supportEmail: process.env.SUPER_ADMIN_EMAIL || 'info@ubwengelab.rw',
        supportPhone: '+250 800 000 000',
        supportName: 'Customer Care',
        updatedAt: new Date(),
      };
    }

    return settings;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: implement in Sprint 5 once hospital schema is live
  async create(dto: CreateAppointmentDto) {
    return dto;
  }
}

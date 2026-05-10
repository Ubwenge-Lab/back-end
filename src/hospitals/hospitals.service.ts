import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET ALL HOSPITALS
  async findAll() {
    return this.prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id } });
    if (!hospital) throw new NotFoundException('Hospital not found');
    return hospital;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findDoctors(hospitalId: string, specialty?: string, available?: boolean) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const where: any = { hospitalId };
    if (specialty) where.specialization = { contains: specialty, mode: 'insensitive' };
    if (available !== undefined) where.isAvailable = available;

    return this.prisma.doctor.findMany({
      where,
      include: {
        user: {
          include: {
            hospitalStaff: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
      orderBy: [{ rating: 'desc' }, { specialization: 'asc' }],
    });
  }
}

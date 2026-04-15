import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TriangulationService {
    constructor(private prisma: PrismaService) { }

    async getGlobalCoordinates() {
        // 1. Fetch main pharmacy coordinates
        const pharmacies = await this.prisma.pharmacy.findMany({
            select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
                status: true,
                address: true,
            },
        });

        // 2. Fetch all branch coordinates
        const branches = await this.prisma.branch.findMany({
            select: {
                id: true,
                pharmacyId: true,
                name: true,
                latitude: true,
                longitude: true,
                branchStatus: true,
                address: true,
            },
        });

        return {
            pharmacies,
            branches,
        };
    }
}

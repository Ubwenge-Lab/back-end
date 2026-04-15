import { Module } from '@nestjs/common';
import { TriangulationController } from './triangulation.controller';
import { TriangulationService } from './triangulation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TriangulationController],
  providers: [TriangulationService]
})
export class TriangulationModule { }

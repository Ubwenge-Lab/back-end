import { Module } from '@nestjs/common';
import { TriangulationController } from './triangulation.controller';
import { TriangulationService } from './triangulation.service';
import { PrismaModule } from '../prisma/prisma.module'
import { LocationModule } from '../location/location.module';


@Module({
  imports: [PrismaModule, LocationModule],
  controllers: [TriangulationController],
  providers: [TriangulationService]
})
export class TriangulationModule { }

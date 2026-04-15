import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [HttpModule, PrismaModule],
  providers: [LocationService],
  exports: [LocationService],
  controllers: [LocationController],
})
export class LocationModule {}

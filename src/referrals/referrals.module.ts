import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [HttpModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}

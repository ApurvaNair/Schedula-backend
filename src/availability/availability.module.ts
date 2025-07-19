// src/availability/availability.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { Slot } from './entities/slot.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Slot, Doctor])],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}

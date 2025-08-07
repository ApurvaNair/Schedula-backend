// src/availability/availability.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { Slot } from './entities/slot.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Appointment } from 'src/appointment/entities/appointment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { AppointmentModule } from 'src/appointment/appointment.module';

@Module({
  imports: [TypeOrmModule.forFeature([Slot, Doctor,Appointment]),AuthModule, AppointmentModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}

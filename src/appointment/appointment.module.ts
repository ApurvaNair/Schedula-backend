import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';
import { Slot } from 'src/availability/entities/slot.entity';
import { Appointment } from './entities/appointment.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patients/entities/patient.entity';
import { AvailabilityModule } from 'src/availability/availability.module';

@Module({
  imports: [TypeOrmModule.forFeature([Slot, Appointment,Doctor,Patient]),
  forwardRef(() => AvailabilityModule),
],
  exports: [AppointmentService],
  providers: [AppointmentService],
  controllers: [AppointmentController],
})
export class AppointmentModule {}

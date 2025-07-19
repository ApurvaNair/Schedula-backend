import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';
import { Slot } from 'src/availability/entities/slot.entity';
import { Appointment } from './entities/appointment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Slot, Appointment])],
  providers: [AppointmentService],
  controllers: [AppointmentController],
})
export class AppointmentModule {}

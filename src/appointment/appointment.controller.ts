import {
  Body,
  Controller,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Get,
  UseGuards
} from '@nestjs/common';
import { Request } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentService } from './appointment.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Appointment } from './entities/appointment.entity';
import { Repository } from 'typeorm';
import { AvailabilityService } from 'src/availability/availability.service';

@Controller('api/appointments')
export class AppointmentController {
  constructor( @InjectRepository(Appointment) private readonly appointmentRepo: Repository<Appointment>,

    private readonly appointmentService: AppointmentService,
   private readonly availabilityService: AvailabilityService) {}

  @Post()
  async bookAppointment(@Body() dto: BookAppointmentDto) {
    return this.appointmentService.bookAppointment(dto);
  }

  @Get('doctor/:doctorId/date/:date')
  getDoctorAppointmentsByDate(
    @Param('doctorId', ParseIntPipe) doctorId: number,
    @Param('date') date: string,
  ) {
    return this.appointmentService.getDoctorAppointmentsByDate(doctorId, date);
  }

@Patch(':id/reschedule')
async patientReschedule(
@Param('id', ParseIntPipe) appointmentId: number,
@Body()
body: { newSlotId: number; newStartTime: string; newEndTime: string },){
    return this.appointmentService.patientReschedule(
      appointmentId,
      body.newSlotId,
      body.newStartTime,
      body.newEndTime,
    );
}

@Delete(':id')
async cancelAppointment(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentService.cancelAppointment(id);
}
  
@Patch(':id/finalize-urgency')
@UseGuards(JwtAuthGuard)
async finalizeUrgency(
  @Param('id', ParseIntPipe) appointmentId: number,
  @Body('isUrgent') isUrgent: boolean,
  @Request() req
) {
  return await this.availabilityService.finalizeUrgency(appointmentId, isUrgent,req.user);
}

}

import { Controller, Post, Patch, Delete, Get, Param, Body } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAllDto } from './dto/reschedule-all.dto';
import { RescheduleSelectedDto } from './dto/reschedule-selected.dto';

@Controller('api/appointments')
export class AppointmentController {
  constructor(private readonly service: AppointmentService) {}

  @Post()
  bookAppointment(@Body() dto: BookAppointmentDto) {
    return this.service.bookAppointment(dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: number) {
    return this.service.cancelAppointment(id);
  }

  @Get('patient/:id')
  getPatientAppointments(@Param('id') id: number) {
    return this.service.viewAppointmentsByPatient(id);
  }

  @Get('doctor/:id')
  getDoctorAppointments(@Param('id') id: number) {
    return this.service.viewAppointmentsByDoctor(id);
  }

  @Patch('reschedule-all')
  rescheduleAll(@Body() dto: RescheduleAllDto) {
    return this.service.rescheduleAll(dto);
  }

  @Patch('reschedule-selected')
  rescheduleSelected(@Body() dto: RescheduleSelectedDto) {
    return this.service.rescheduleSelected(dto);
  }
}

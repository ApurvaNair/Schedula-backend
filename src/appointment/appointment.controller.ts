import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAllDto } from './dto/reschedule-all.dto';
import { RescheduleSelectedDto } from './dto/reschedule-selected.dto';

@Controller('api/appointments')
export class AppointmentController {
  constructor(private readonly appointmentsService: AppointmentService) {}

  @Post('slots')
  async createSlot(@Body() dto: CreateSlotDto) {
    return this.appointmentsService.createSlot(dto);
  }

  @Post()
  async bookAppointment(@Body() dto: BookAppointmentDto) {
    return this.appointmentsService.bookAppointment(dto);
  }

  @Patch(':id/reschedule')
  async patientReschedule(
    @Param('id') appointmentId: string,
    @Body('newSlotId') newSlotId: number,
  ) {
    return this.appointmentsService.patientReschedule(+appointmentId, newSlotId);
  }

  @Patch('reschedule-all')
  async rescheduleAll(@Body() dto: RescheduleAllDto) {
    return this.appointmentsService.rescheduleAll(dto);
  }

  @Patch('reschedule-selected')
  async rescheduleSelected(@Body() dto: RescheduleSelectedDto) {
    return this.appointmentsService.rescheduleSelected(dto);
  }

  @Delete(':id')
  async cancelAppointment(@Param('id') id: string) {
    return this.appointmentsService.cancelAppointment(+id);
  }
}

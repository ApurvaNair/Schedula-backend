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
import { AppointmentService } from './appointment.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { ConfirmBufferDto } from './dto/confirm-buffer.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('api/appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  async bookAppointment(@Body() dto: BookAppointmentDto) {
    return this.appointmentService.bookAppointment(dto);
  }

  @Post('buffer-confirm')
  @UseGuards(JwtAuthGuard)
  async confirmBufferSlot(@Body() dto: ConfirmBufferDto) {
  return this.appointmentService.confirmBufferSlot(dto);
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
    body: { newSlotId: number; newStartTime: string; newEndTime: string },
  ) {
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

}

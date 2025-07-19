import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/doctors')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get(':id/slots')
  async getDoctorSlots(@Param('id', ParseIntPipe) doctorId: number) {
    return this.availabilityService.getDoctorSlots(doctorId);
  }

  @Post(':id/slots')
  @Roles('doctor')
  async addAvailability(
    @Param('id', ParseIntPipe) doctorId: number,
    @Request() req,
    @Body()
    body: {
      date: string;
      startTime: string;
      endTime: string;
      mode: string;
      maxBookings: number;
    },
  ) {
    const doctor = await this.availabilityService.getDoctorById(doctorId);

    if (doctor.user.id !== req.user.id) {
      throw new HttpException(
        'Only the doctor can add availability to their profile',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.availabilityService.createSlot(doctorId, body);
  }

  @Delete(':id/slots/:slotId')
  @Roles('doctor')
  async deleteSlot(
    @Param('id', ParseIntPipe) doctorId: number,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Request() req,
  ) {
    const doctor = await this.availabilityService.getDoctorById(doctorId);

    if (doctor.user.id !== req.user.id) {
      throw new HttpException(
        'Only the doctor can delete this slot',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.availabilityService.deleteSlot(slotId, doctorId);
  }
}

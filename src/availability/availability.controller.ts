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
  Patch,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { CreateSlotDto } from './dto/create-slot.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/doctors/:id/slots')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getDoctorSlots(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.getDoctorSlots(id);
  }

  @Post()
  @Roles('doctor')
  async addAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: CreateSlotDto,
  ) {
    const doctor = await this.availabilityService.getDoctorById(id);
    if (doctor.user.id !== req.user.id) {
      throw new HttpException('Only the doctor can add availability', HttpStatus.FORBIDDEN);
    }
    return this.availabilityService.createSlot(id, body);
  }

  @Patch(':slotId')
  @Roles('doctor')
  async rescheduleSlot(
    @Param('id', ParseIntPipe) id: number,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Request() req,
    @Body() updateData: {
      date?: string;
      startTime?: string;
      endTime?: string;
      mode?: string;
    },
  ) {
    const doctor = await this.availabilityService.getDoctorById(id);
    if (doctor.user.id !== req.user.id) {
      throw new HttpException('Only the doctor can update this slot', HttpStatus.FORBIDDEN);
    }
    return this.availabilityService.rescheduleSlot(id, slotId, updateData);
  }

  @Patch(':slotId/shrink')
  async shrinkSlot(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Body('newEndTime') newEndTime: string,
    @Request() req,
  ) {
    if (!newEndTime) {
      throw new HttpException('New end time is required', HttpStatus.BAD_REQUEST);
    }
    return this.availabilityService.shrinkSlot(slotId, newEndTime);
  }

  @Delete(':slotId')
  @Roles('doctor')
  async deleteSlot(
    @Param('id', ParseIntPipe) id: number,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Request() req,
  ) {
    const doctor = await this.availabilityService.getDoctorById(id);
    if (doctor.user.id !== req.user.id) {
      throw new HttpException('Only the doctor can delete this slot', HttpStatus.FORBIDDEN);
    }
    return this.availabilityService.deleteSlot(slotId, id);
  }

  @Get('sub-slots/:date')
  @Roles('doctor')
  async getAvailableSubSlots(
    @Param('id', ParseIntPipe) id: number,
    @Param('date') date: string,
  ) {
    return this.availabilityService.getAvailableSubSlots(id, date);
  }

  @Delete('recurring/:recurringId')
  @Roles('doctor')
  async deleteRecurringSlots(
    @Param('id', ParseIntPipe) id: number,
    @Param('recurringId') recurringId: string,
    @Request() req,
  ) {
    const doctor = await this.availabilityService.getDoctorById(id);
    if (doctor.user.id !== req.user.id) {
      throw new HttpException('Only the doctor can delete these slots', HttpStatus.FORBIDDEN);
    }
    return this.availabilityService.deleteRecurringSlots(id, recurringId);
  }

  @Delete('recurring/:recurringId/from/:date')
  @Roles('doctor')
  async deleteRecurringSlotsFromDate(
    @Param('id', ParseIntPipe) id: number,
    @Param('recurringId') recurringId: string,
    @Param('date') date: string,
    @Request() req,
  ) {
    const doctor = await this.availabilityService.getDoctorById(id);
    if (doctor.user.id !== req.user.id) {
      throw new HttpException('Only the doctor can delete these slots', HttpStatus.FORBIDDEN);
    }
    return this.availabilityService.deleteRecurringSlotsFromDate(id, recurringId, date);
  }
}

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import * as dayjs from 'dayjs';
import { Slot } from './entities/slot.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { Appointment } from 'src/appointment/entities/appointment.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,

    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,

    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
  ) {}

  async getDoctorById(doctorId: number): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['user'],
    });

    if (!doctor) {
      throw new HttpException('Doctor not found', HttpStatus.NOT_FOUND);
    }

    return doctor;
  }

  async getDoctorSlots(doctorId: number) {
    return this.slotRepo.find({
      where: { doctor: { id: doctorId } },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  async createSlot(doctorId: number, dto: CreateSlotDto) {
    const { date, startTime, endTime, mode, maxBookings, slotDuration } = dto;

    const now = dayjs();
    const slotStart = dayjs(`${date}T${startTime}`);
    const slotEnd = dayjs(`${date}T${endTime}`);

    if (!slotStart.isValid() || !slotEnd.isValid() || !slotEnd.isAfter(slotStart)) {
      throw new HttpException('Invalid slot time range', HttpStatus.BAD_REQUEST);
    }

    if (slotStart.isBefore(now)) {
      throw new HttpException('Cannot create a slot in the past', HttpStatus.BAD_REQUEST);
    }

    // Disallow overlapping slots
    const existingSlots = await this.slotRepo.find({
      where: { doctor: { id: doctorId }, date },
    });

    const overlapping = existingSlots.find((s) => {
      const sStart = dayjs(`${s.date}T${s.startTime}`);
      const sEnd = dayjs(`${s.date}T${s.endTime}`);
      return slotStart.isBefore(sEnd) && slotEnd.isAfter(sStart);
    });

    if (overlapping) {
      throw new HttpException(
        `Slot overlaps with an existing slot from ${overlapping.startTime} to ${overlapping.endTime}`,
        HttpStatus.CONFLICT,
      );
    }

    const createdSlots: Slot[] = [];

    if (mode === 'stream') {
      if (!slotDuration || slotDuration <= 0) {
        throw new HttpException('slotDuration is required for stream mode', HttpStatus.BAD_REQUEST);
      }

      let currentStart = slotStart;

      while (currentStart.isBefore(slotEnd)) {
        const currentEnd = currentStart.add(slotDuration, 'minute');

        if (currentEnd.isAfter(slotEnd)) break;

        const streamSlot = this.slotRepo.create({
          doctor: { id: doctorId },
          date,
          startTime: currentStart.format('HH:mm'),
          endTime: currentEnd.format('HH:mm'),
          mode,
          maxBookings: 1,
        });

        const saved = await this.slotRepo.save(streamSlot);
        createdSlots.push(saved);

        currentStart = currentEnd;
      }

    } else if (mode === 'wave') {
      const waveSlot = this.slotRepo.create({
        doctor: { id: doctorId },
        date,
        startTime,
        endTime,
        mode,
        maxBookings,
      });

      const saved = await this.slotRepo.save(waveSlot);
      createdSlots.push(saved);

    } else {
      throw new HttpException('Invalid mode. Choose either "stream" or "wave"', HttpStatus.BAD_REQUEST);
    }

    return createdSlots;
  }

  async deleteSlot(slotId: number, doctorId: number) {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, doctor: { id: doctorId } },
    });

    if (!slot) {
      throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);
    }

    const isBooked = await this.appointmentRepo.findOne({
      where: { slot: { id: slot.id } },
    });

    if (isBooked) {
      throw new HttpException(
        'Cannot delete a slot that has already been booked',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.slotRepo.remove(slot);
  }

  async rescheduleSlot(
    doctorId: number,
    slotId: number,
    updateData: {
      date?: string;
      startTime?: string;
      endTime?: string;
      mode?: string;
    },
  ) {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, doctor: { id: doctorId } },
    });

    if (!slot) {
      throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);
    }

    const existingAppointments = await this.appointmentRepo.count({
      where: { slot: { id: slot.id } },
    });

    if (existingAppointments > 0) {
      throw new HttpException(
        'Cannot reschedule a slot with existing bookings',
        HttpStatus.BAD_REQUEST,
      );
    }

    const newDate = updateData.date || slot.date;
    const newStartTime = updateData.startTime || slot.startTime;
    const newEndTime = updateData.endTime || slot.endTime;

    const slotStart = dayjs(`${newDate}T${newStartTime}`);
    const slotEnd = dayjs(`${newDate}T${newEndTime}`);

    if (!slotStart.isValid() || !slotEnd.isValid() || !slotEnd.isAfter(slotStart)) {
      throw new HttpException('Invalid time range', HttpStatus.BAD_REQUEST);
    }

    if (slotStart.isBefore(dayjs())) {
      throw new HttpException('Cannot reschedule to a past time', HttpStatus.BAD_REQUEST);
    }

    const existingSlots = await this.slotRepo.find({
      where: {
        doctor: { id: doctorId },
        date: newDate,
        id: Not(slot.id),
      },
    });

    const overlapping = existingSlots.find((s) => {
      const sStart = dayjs(`${s.date}T${s.startTime}`);
      const sEnd = dayjs(`${s.date}T${s.endTime}`);
      return slotStart.isBefore(sEnd) && slotEnd.isAfter(sStart);
    });

    if (overlapping) {
      throw new HttpException(
        `New slot overlaps with existing slot from ${overlapping.startTime} to ${overlapping.endTime}`,
        HttpStatus.CONFLICT,
      );
    }

    slot.date = newDate;
    slot.startTime = newStartTime;
    slot.endTime = newEndTime;
    slot.mode = updateData.mode || slot.mode;

    return await this.slotRepo.save(slot);
  }
}

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import dayjs from 'dayjs';
import { Slot } from './entities/slot.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { Appointment } from 'src/appointment/entities/appointment.entity';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(isSameOrBefore);

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
    if (!doctor) throw new HttpException('Doctor not found', HttpStatus.NOT_FOUND);
    return doctor;
  }

  async getDoctorSlots(doctorId: number): Promise<Slot[]> {
    return this.slotRepo.find({
      where: { doctor: { id: doctorId } },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  async createSlot(doctorId: number, dto: CreateSlotDto): Promise<Slot> {
    const { date, startTime, endTime, mode, maxBookings, slotDuration } = dto;
    const now = dayjs();
    const start = dayjs(`${date}T${startTime}`);
    const end = dayjs(`${date}T${endTime}`);

    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
      throw new HttpException('Invalid session time range', HttpStatus.BAD_REQUEST);
    }
    if (start.isBefore(now)) {
      throw new HttpException('Cannot create session in the past', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.slotRepo.findOne({
      where: {
        doctor: { id: doctorId },
        date,
        startTime,
        endTime,
      },
    });
    if (existing) throw new HttpException('Duplicate session not allowed', HttpStatus.CONFLICT);

    const session = this.slotRepo.create({
      doctor: { id: doctorId },
      date,
      startTime,
      endTime,
      mode,
      maxBookings,
      slotDuration,
    });
    return this.slotRepo.save(session);
  }

  async deleteSlot(slotId: number, doctorId: number): Promise<void> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, doctor: { id: doctorId } },
    });
    if (!slot) throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);
    const hasAppt = await this.appointmentRepo.findOne({
      where: { slot: { id: slot.id } },
    });
    if (hasAppt) {
      throw new HttpException('Cannot delete session with bookings', HttpStatus.BAD_REQUEST);
    }
    await this.slotRepo.remove(slot);
  }

  async rescheduleSlot(
    doctorId: number,
    slotId: number,
    data: { date?: string; startTime?: string; endTime?: string },
  ): Promise<Slot> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, doctor: { id: doctorId } },
    });
    if (!slot) throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);

    const apptCount = await this.appointmentRepo.count({
      where: { slot: { id: slot.id } },
    });
    if (apptCount > 0) throw new HttpException('Cannot reschedule session with bookings', HttpStatus.BAD_REQUEST);

    slot.date = data.date || slot.date;
    slot.startTime = data.startTime || slot.startTime;
    slot.endTime = data.endTime || slot.endTime;

    const start = dayjs(`${slot.date}T${slot.startTime}`);
    const end = dayjs(`${slot.date}T${slot.endTime}`);
    const now = dayjs();

    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
      throw new HttpException('Invalid session range', HttpStatus.BAD_REQUEST);
    }
    if (start.isBefore(now)) {
      throw new HttpException('Cannot reschedule into the past', HttpStatus.BAD_REQUEST);
    }

    const conflict = await this.slotRepo.findOne({
      where: {
        doctor: { id: doctorId },
        date: slot.date,
        id: Not(slot.id),
      },
    });
    if (conflict) {
      const cStart = conflict.startTime;
      const cEnd = conflict.endTime;
      throw new HttpException(`Conflicts with ${cStart}-${cEnd}`, HttpStatus.CONFLICT);
    }

    return this.slotRepo.save(slot);
  }

  async getAvailableSubSlots(doctorId: number, date: string) {
    const sessions = await this.slotRepo.find({
      where: { doctor: { id: doctorId }, date },
    });
    const appointments = await this.appointmentRepo.find({
      relations: ['slot'],
      where: {
        slot: {
          doctor: { id: doctorId },
          date,
        },
      },
    });

    const result: { sessionId: number; startTime: string; endTime: string }[] = [];

    for (const s of sessions) {
      let t = dayjs(`${s.date}T${s.startTime}`);
      const end = dayjs(`${s.date}T${s.endTime}`);

      while (t.add(s.slotDuration, 'minute').isSameOrBefore(end)) {
        const st = t.format('HH:mm');
        const en = t.add(s.slotDuration, 'minute').format('HH:mm');

        const isBooked = appointments.some(
          (a) =>{
            const apptStart = dayjs(`${a.date}T${a.startTime}`).format('HH:mm');
            const apptEnd = dayjs(`${a.date}T${a.endTime}`).format('HH:mm');
            return apptStart === st && apptEnd === en && a.slot.id === s.id;
          }
        );

        if (!isBooked) {
          result.push({
            sessionId: s.id,
            startTime: st,
            endTime: en,
          });
        }

        t = t.add(s.slotDuration, 'minute');
      }
    }

    return result;
  }
}

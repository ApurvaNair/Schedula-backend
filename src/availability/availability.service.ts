import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import dayjs from 'dayjs';
import { Slot } from './entities/slot.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { Appointment } from 'src/appointment/entities/appointment.entity';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { AppointmentService } from 'src/appointment/appointment.service';

dayjs.extend(isSameOrBefore);

@Injectable()
export class AvailabilityService {
  slotRepository: any;
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

  async shrinkSlot(slotId: number, newEndTime: string) {
    const slot = await this.slotRepo.findOne({
    where: { id: slotId },
    relations: ['appointments', 'appointments.patient'],
    });
  
    if (!slot) throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);
  
    const newEnd = dayjs(`${slot.date}T${newEndTime}`);
    const originalEnd = dayjs(`${slot.date}T${slot.endTime}`);
  
    if (newEnd.isAfter(originalEnd)) {
      throw new HttpException('New end time cannot be after original end', HttpStatus.BAD_REQUEST);
    }
  
    const affectedAppointments = slot.appointments.filter(a =>
      dayjs(`${slot.date}T${a.endTime}`).isAfter(newEnd)
    );
  
    const result: {
    id: number;
    patientId: number;
    actionRequired: string;
  }[] = [];
  
     for (const appointment of affectedAppointments) {
    if (appointment.priority <= 2 && !appointment.isUrgencyFinalized) {
      result.push({
        id: appointment.id,
        patientId: appointment.patient.id,
        actionRequired: 'Doctor Review: Emergency case',
      });
    } else {
      result.push({
        id: appointment.id,
        patientId: appointment.patient.id,
        actionRequired: 'Cancel / Reschedule',
      });
    }
  }
    slot.endTime = newEndTime;
    await this.slotRepo.save(slot);
  
    return {
      message: 'Slot shrunk successfully',
      affectedAppointments: result,
    };
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

  async deleteSlot(slotId: number, doctorId: number) {
  const slot = await this.slotRepo.findOne({
    where: { id: slotId },
    relations: ['doctor', 'appointments', 'appointments.patient'],
  });

  if (!slot) {
    throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);
  }

  if (slot.doctor.id !== doctorId) {
    throw new HttpException('Unauthorized access', HttpStatus.FORBIDDEN);
  }

  if (!slot.appointments || slot.appointments.length === 0) {
    await this.slotRepo.remove(slot);
    return { message: 'Slot deleted successfully (no appointments)' };
  }
  const latestValidTime = slot.appointments.reduce((latest, appt) => {
    return dayjs(`${slot.date}T${appt.endTime}`).isAfter(latest)
      ? dayjs(`${slot.date}T${appt.endTime}`)
      : latest;
  }, dayjs(`${slot.date}T${slot.startTime}`));

  slot.endTime = latestValidTime.format('HH:mm');
  await this.slotRepo.save(slot);

  return {
    message: 'Slot could not be deleted due to existing appointments. Shrink the slot instead.',
    newEndTime: slot.endTime,
  };
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

    const otherSlots = await this.slotRepo.find({
      where: {
        doctor: { id: doctorId },
        date: slot.date,
        id: Not(slot.id),
      },
    });

    for (const s of otherSlots) {
      const sStart = dayjs(`${s.date}T${s.startTime}`);
      const sEnd = dayjs(`${s.date}T${s.endTime}`);

      if (start.isBefore(sEnd) && end.isAfter(sStart)) {
        throw new HttpException(`Conflicts with slot ${s.startTime}-${s.endTime}`, HttpStatus.CONFLICT);
      }
    }

    const doctorAppointments = await this.appointmentRepo.find({
      where: {
        slot: {
          doctor: { id: doctorId },
          date: slot.date,
        },
      },
      relations: ['slot'],
    });

    for (const appt of doctorAppointments) {
      const apptStart = dayjs(`${slot.date}T${appt.startTime}`);
      const apptEnd = dayjs(`${slot.date}T${appt.endTime}`);

      if (start.isBefore(apptEnd) && end.isAfter(apptStart)) {
        throw new HttpException(
          `Conflicts with existing appointment ${appt.startTime}-${appt.endTime}`,
          HttpStatus.CONFLICT,
        );
      }
    }

    return this.slotRepo.save(slot);
  }

 async getAvailableSubSlots(doctorId: number, date: string) {
  const sessions = await this.slotRepo.find({
    where: { doctor: { id: doctorId }, date },
  });

  const appointments = await this.appointmentRepo
    .createQueryBuilder('appointment')
    .leftJoinAndSelect('appointment.slot', 'slot')
    .where('slot.doctorId = :doctorId', { doctorId })
    .andWhere('slot.date = :date', { date })
    .getMany();

  const result: { sessionId: number; subSlotId: string; startTime: string; endTime: string }[] = [];

  for (const s of sessions) {
    let t = dayjs(`${s.date}T${s.startTime}`);
    const end = dayjs(`${s.date}T${s.endTime}`);

    while (t.isBefore(end)) {
      const st = t;
      const en = t.add(s.slotDuration, 'minute');

      if (en.isAfter(end)) break;

      const isBooked = appointments.some((a) => {
        const apptStart = dayjs(`${a.date}T${a.startTime}`);
        const apptEnd = dayjs(`${a.date}T${a.endTime}`);
        return (
          a.slot.id === s.id &&
          st.isBefore(apptEnd) &&
          en.isAfter(apptStart)
        );
      });

      if (!isBooked) {
        result.push({
          sessionId: s.id,
          subSlotId: `${s.id}_${st.format('HHmm')}_${en.format('HHmm')}`,
          startTime: st.format('HH:mm'),
          endTime: en.format('HH:mm'),
        });
      }

      t = t.add(s.slotDuration, 'minute'); 
    }
  }

  return result;
}

  async finalizeUrgency(appointmentId: number) {
  const appointment = await this.appointmentRepo.findOne({
    where: { id: appointmentId },
    relations: ['slot'],
  });

  if (!appointment) {
    throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
  }

  appointment.isUrgencyFinalized = true;
 
  await this.appointmentRepo.save(appointment);

  return {
    message: 'Urgency finalized',
    appointmentId
  };
}

}

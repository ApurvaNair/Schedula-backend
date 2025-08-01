import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import dayjs from 'dayjs';
import { Slot } from './entities/slot.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { Appointment } from 'src/appointment/entities/appointment.entity';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { v4 as uuidv4 } from 'uuid';
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
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    private appointmentService: AppointmentService,
  ) {}

  async getDoctorById(doctorId: number): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['user'],
    });
    if (!doctor) throw new HttpException('Doctor not found', HttpStatus.NOT_FOUND);
    return doctor;
  }

  async shrinkSlot(slotId: number, newEndTime: string, user:any) {
  const slot = await this.slotRepo.findOne({
    where: { id: slotId },
    relations: ['doctor','appointments', 'appointments.patient'],
  });

  if (!slot) throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);

  if (slot.doctor.id !== user.id) {
    throw new HttpException('Forbidden: You do not own this slot', HttpStatus.FORBIDDEN);
  }
  const newEnd = dayjs(`${slot.date}T${newEndTime}`);
  const originalEnd = dayjs(`${slot.date}T${slot.endTime}`);
  if (newEnd.isAfter(originalEnd)) {
    throw new HttpException('New end time cannot be after original end', HttpStatus.BAD_REQUEST);
  }

  const affectedAppointments = slot.appointments.filter(a =>
    dayjs(`${slot.date}T${a.endTime}`).isAfter(newEnd)
  );

  affectedAppointments.sort((a, b) => a.priority - b.priority);

  const subslots = await this.slotRepo.find({
    where: {
      doctor: slot.doctor,
      date: slot.date,
      type: 'normal',
    },
    relations: ['appointments'],
  });

  const now = dayjs();

  const availableSubslots = subslots.filter(s => {
    const subEnd = dayjs(`${s.date}T${s.endTime}`);
    const subStart = dayjs(`${s.date}T${s.startTime}`);
    return (
      s.appointments.length === 0 &&
      subEnd.isSameOrBefore(newEnd) &&
      subStart.isAfter(now) // ✅ Only future subslots
    );
  });

  const result: {
    id: number;
    patientId: number;
    actionRequired: string;
  }[] = [];

  let hasUnresolvedUrgentCases = false;

  for (const appointment of affectedAppointments) {
    let moved = false;

    for (let i = 0; i < availableSubslots.length; i++) {
      const subslot = availableSubslots[i];
      const duration = dayjs(`${slot.date}T${appointment.endTime}`).diff(
        dayjs(`${slot.date}T${appointment.startTime}`),
        'minute'
      );

      const subStart = dayjs(`${subslot.date}T${subslot.startTime}`);
      const subEnd = dayjs(`${subslot.date}T${subslot.endTime}`);
      const subDuration = subEnd.diff(subStart, 'minute');

      if (subDuration >= duration) {
        // ✅ Move appointment to this subslot
        appointment.slot = subslot;
        appointment.startTime = subslot.startTime;
        appointment.endTime = subslot.endTime;

        await this.appointmentRepo.save(appointment);

        result.push({
          id: appointment.id,
          patientId: appointment.patient.id,
          actionRequired: 'Moved to available subslot',
        });

        availableSubslots.splice(i, 1); // Mark slot as occupied
        moved = true;
        break;
      }
    }

    if (!moved) {
      if (appointment.priority === 1 && !appointment.isUrgencyFinalized) {
        result.push({
          id: appointment.id,
          patientId: appointment.patient.id,
          actionRequired: 'Doctor Review: Emergency case',
        });
        hasUnresolvedUrgentCases = true;
      } else {
        result.push({
          id: appointment.id,
          patientId: appointment.patient.id,
          actionRequired: 'Cancel / Reschedule',
        });
      }
    }
  }

  if (hasUnresolvedUrgentCases) {
    return {
      message: 'Cannot shrink until doctor reviews and finalizes urgent appointments',
      affectedAppointments: result,
    };
  }

  slot.endTime = newEndTime;
  await this.slotRepo.save(slot);

  return {
    message: 'Slot window successfully shrunk',
    affectedAppointments: result,
  };
}


  async getDoctorSlots(doctorId: number): Promise<Slot[]> {
    return this.slotRepo.find({
      where: { doctor: { id: doctorId } },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

async createSlot(doctorId: number, dto: CreateSlotDto): Promise<any> {
  const {
    date,
    startDate,
    endDate,
    daysOfWeek,
    startTime,
    endTime,
    mode,
    maxBookings,
    slotDuration,
    type = 'normal', 
  } = dto;

  const now = dayjs();

  const isRecurring = !!startDate && !!endDate && Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
  const recurringId: string | undefined = isRecurring ? uuidv4() : undefined;

  if (isRecurring) {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
      throw new HttpException('Invalid recurring date range', HttpStatus.BAD_REQUEST);
    }

    const created: Slot[] = [];

    for (let d = start; d.isSameOrBefore(end); d = d.add(1, 'day')) {
      const dayName = d.format('dddd').toUpperCase();

      if (daysOfWeek.includes(dayName)) {
        if (d.isBefore(now, 'day')) continue;

        const dateStr = d.format('YYYY-MM-DD');
        const startDt = dayjs(`${dateStr}T${startTime}`);
        const endDt = dayjs(`${dateStr}T${endTime}`);

        if (!startDt.isValid() || !endDt.isValid() || !endDt.isAfter(startDt)) continue;

        const exists = await this.slotRepo.findOne({
          where: {
            doctor: { id: doctorId },
            date: dateStr,
            startTime,
            endTime,
            type,
          },
        });

        if (exists) continue;

        const session = this.slotRepo.create({
          doctor: { id: doctorId },
          date: dateStr,
          startTime,
          endTime,
          mode,
          maxBookings,
          slotDuration,
          recurringId,
          type,
        });

        created.push(session);
      }
    }

    await this.slotRepo.save(created);
    return {
      message: 'Recurring slots created',
      recurringId,
      count: created.length,
    };
  }

  if (!date) {
    throw new HttpException('Date is required for one-time slot', HttpStatus.BAD_REQUEST);
  }

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
      type,
    },
  });

  if (existing) {
    throw new HttpException('Duplicate session not allowed', HttpStatus.CONFLICT);
  }

  const session = this.slotRepo.create({
    doctor: { id: doctorId },
    date,
    startTime,
    endTime,
    mode,
    maxBookings,
    slotDuration,
    recurringId: null,
    type,
  });

  return this.slotRepo.save(session);
}

async deleteRecurringSlots(doctorId: number, recurringId: string) {
  const deleted = await this.slotRepo.delete({
    doctor: { id: doctorId },
    recurringId,
  });

  if (deleted.affected === 0) {
    throw new NotFoundException('No recurring slots found');
  }

  return { message: 'All recurring slots deleted successfully' };
}
async deleteRecurringSlotsFromDate(doctorId: number, recurringId: string, fromDate: string) {
  const deleted = await this.slotRepo
    .createQueryBuilder()
    .delete()
    .from(Slot)
    .where('doctorId = :doctorId', { doctorId })
    .andWhere('recurringId = :recurringId', { recurringId })
    .andWhere('date >= :fromDate', { fromDate })
    .execute();

  if (deleted.affected === 0) {
    throw new NotFoundException('No matching recurring slots found from given date');
  }

  return { message: 'Recurring slots from specified date deleted successfully' };
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
    // ❗ Ignore appointments that belong to this same slot
    if (appt.slot.id === slot.id) continue;

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

  const result: {
    sessionId: number;
    subSlotId: string;
    startTime: string;
    endTime: string;
  }[] = [];

  for (const s of sessions) {
    let t = dayjs(`${s.date}T${s.startTime}`);
    const end = dayjs(`${s.date}T${s.endTime}`);

    while (t.isBefore(end)) {
      const st = t;
      const en = t.add(s.slotDuration, 'minute');

      if (en.isAfter(end)) break;

      const isBooked = appointments.some((a) => {
        const apptStart = dayjs(`${a.slot.date}T${a.startTime}`);
        const apptEnd = dayjs(`${a.slot.date}T${a.endTime}`);
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


async finalizeUrgency(appointmentId: number, isUrgent: boolean, user: any) {
  const appointment = await this.appointmentRepo.findOne({
    where: {
  id: appointmentId,
  priority: 1,
  isUrgencyFinalized: false,
},
    relations: ['slot'],
  });

  if (!appointment) {
    throw new HttpException('No urgent appointment found', HttpStatus.NOT_FOUND);
  }

  let message: string;

  if (appointment.slot.doctor.id !== user.id) {
    throw new HttpException('Forbidden: You do not own this appointment\'s slot', HttpStatus.FORBIDDEN);
  }

  if (isUrgent) {
    const bufferSlots = await this.slotRepo.find({
      where: {
        date: appointment.slot.date,
        type: 'buffer',
      },
      relations: ['appointments'],
    });

    const availableBuffer = bufferSlots.find(
      (slot) => slot.appointments.filter((app) => app.priority).length < slot.maxBookings,
    );

    if (availableBuffer) {
      appointment.slot = availableBuffer;
      appointment.startTime = availableBuffer.startTime;
      appointment.endTime = availableBuffer.endTime;
      message = 'Moved to buffer';
    } else {
      message = 'No buffer available, appointment marked for Cancel/Reschedule';
    }
  } else {
    const updatedPriority = this.appointmentService.getPriorityFromReason(appointment.reasonCategory);
    appointment.priority = updatedPriority;
    message = 'Marked as non-urgent. Suggest Cancel/Reschedule';
  }

  appointment.isUrgencyFinalized = true;
  await this.appointmentRepo.save(appointment);

  return {
    message,
    updatedPriority: appointment.priority,
  };
}


}

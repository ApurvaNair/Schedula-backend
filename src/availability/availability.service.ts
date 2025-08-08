import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import dayjs from 'dayjs';
import { Slot } from './entities/slot.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { Appointment } from 'src/appointment/entities/appointment.entity';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { v4 as uuidv4 } from 'uuid';
import { AppointmentService } from 'src/appointment/appointment.service';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

@Injectable()
export class AvailabilityService {
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

 async shrinkSlot(slotId: number, newEndTime: string) {
  const slot = await this.slotRepo.findOne({
    where: { id: slotId },
    relations: ['appointments', 'appointments.patient'],
  });
  if (!slot) throw new NotFoundException('Slot not found');

  const start = dayjs(`${slot.date}T${slot.startTime}`);
  const newEnd = dayjs(`${slot.date}T${newEndTime}`);
  const totalMinutes = newEnd.diff(start, 'minute');

  if (totalMinutes < 5) {
    throw new HttpException('Shrunken window too small', HttpStatus.BAD_REQUEST);
  }

  const allAppointments = (slot.appointments || []).filter(a => a.startTime && a.endTime).sort((a, b) =>
    dayjs(`${a.date || slot.date}T${a.startTime}`).diff(dayjs(`${b.date || slot.date}T${b.startTime}`)),
  );

  const inside = allAppointments.filter(a =>
    dayjs(`${a.date || slot.date}T${a.startTime}`).isBefore(newEnd),
  );

  const affected = allAppointments.filter(a =>
    dayjs(`${a.date || slot.date}T${a.startTime}`).isSameOrAfter(newEnd),
  );

  const totalToFit = inside.length + affected.length;

  if (slot.mode === 'stream') {
    return this.handleStreamMode(slot, start, newEnd, inside, affected, totalMinutes, totalToFit);
  }

  if (slot.mode === 'wave') {
    return this.handleWaveMode(slot, start, newEnd, inside, affected, totalMinutes, totalToFit);
  }

  throw new HttpException('Unsupported mode', HttpStatus.BAD_REQUEST);
}


private calculateSubslotDuration(
  totalMinutes: number,
  totalToFit: number,
): { subslotDuration: number; finalToFit: number } {
  while (totalToFit > 0) {
    const duration = Math.floor(totalMinutes / totalToFit);
    if (duration >= 5) {
      return { subslotDuration: duration, finalToFit: totalToFit };
    }
    totalToFit--;
  }

  throw new HttpException(
    `Unable to assign minimum 5-minute subslot to any appointment. Total minutes: ${totalMinutes}, Total appointments: ${totalToFit}`,
    HttpStatus.BAD_REQUEST,
  );
}


private async handleStreamMode(
  slot: Slot,
  start: dayjs.Dayjs,
  newEnd: dayjs.Dayjs,
  inside: Appointment[],
  affected: Appointment[],
  totalMinutes: number,
  totalToFit: number,
) {
  const statuses: { id: number; action: string; message?: string }[] = [];

  const sortedInside = inside.sort((a, b) => a.id - b.id);
  const sortedAffected = affected.sort((a, b) => {
    const aEmergency = a.isUrgencyFinalized === true;
    const bEmergency = b.isUrgencyFinalized === true;
    if (aEmergency !== bEmergency) return aEmergency ? 1 : -1; 
    return a.id - b.id;
  });

  const allAppointments = [...sortedInside, ...sortedAffected];

  const { subslotDuration, finalToFit } = this.calculateSubslotDuration(totalMinutes, allAppointments.length);

  const appointmentsToFit = allAppointments.slice(0, finalToFit);
  const overflowAppointments = allAppointments.slice(finalToFit);

  let currentTime = start;
  for (const appointment of appointmentsToFit) {
    const newStart = currentTime;
    const newEndTime = currentTime.add(subslotDuration, 'minute');

    appointment.startTime = newStart.format('HH:mm');
    appointment.endTime = newEndTime.format('HH:mm');

    currentTime = newEndTime;
    await this.appointmentRepo.save(appointment);
  }

  for (const appointment of overflowAppointments) {
    if (appointment.isUrgencyFinalized === true) {
      const buffer = slot.appointments.find(a => a.slot?.type === 'buffer');
      if (buffer) {
        appointment.startTime = buffer.startTime;
        appointment.endTime = buffer.endTime;
        await this.appointmentRepo.save(appointment);

        statuses.push({
          id: appointment.id,
          action: 'moved-to-buffer',
          message: 'Emergency appointment moved to buffer due to overflow',
        });
      } else {
        throw new HttpException(
          `Emergency appointment (${appointment.id}) couldn't fit. Please create buffer manually.`,
          HttpStatus.CONFLICT,
        );
      }
    } else {
      appointment.isConfirmed = false;
      await this.appointmentRepo.save(appointment);

      statuses.push({
        id: appointment.id,
        action: 'patient-cancel-or-reschedule',
        message: 'Appointment could not be rescheduled automatically. Patient must cancel or choose another time.',
      });
    }
  }

  const bufferAppointments = slot.appointments.filter(a => a.slot?.type === 'buffer');
  for (const buffer of bufferAppointments) {
    await this.appointmentRepo.remove(buffer);
  }

  slot.endTime = newEnd.format('HH:mm');
  await this.slotRepo.save(slot);

  return { message: 'Slot window shrunk successfully', statuses };
}

  private async handleWaveMode(
  slot: Slot,
  start: dayjs.Dayjs,
  newEnd: dayjs.Dayjs,
  inside: Appointment[],
  affected: Appointment[],
  totalMinutes: number,
  totalToFit: number,
) {
  let waveInterval = slot.slotDuration || 10;

  let minutesPerPatient = totalMinutes / totalToFit;
  if (minutesPerPatient < 5) {
    totalToFit = Math.floor(totalMinutes / 5);
    minutesPerPatient = totalMinutes / totalToFit;
  }
  waveInterval = Math.max(waveInterval, Math.ceil(minutesPerPatient));
  const waveCount = Math.floor(totalMinutes / waveInterval);

  if (waveCount < 1) {
    throw new HttpException('Not enough time for even one wave', HttpStatus.BAD_REQUEST);
  }

  const newMaxBookings = Math.ceil(totalToFit / waveCount);
  const statuses: { id: number; action: string }[] = [];

  let pointer = start.clone();
  const waveMap: Record<string, Appointment[]> = {};
  const waveTimes: dayjs.Dayjs[] = [];

  for (let i = 0; i < waveCount; i++) {
    const waveStartTime = pointer.clone();
    const waveKey = waveStartTime.format('HH:mm');
    waveMap[waveKey] = [];
    waveTimes.push(waveStartTime);
    pointer = pointer.add(waveInterval, 'minute');
  }

  inside.sort((a, b) =>
    dayjs(`${slot.date}T${a.startTime}`).diff(dayjs(`${slot.date}T${b.startTime}`))
  );

  for (const appt of inside) {
    const originalTime = dayjs(`${slot.date}T${appt.startTime}`);
    const waveKey = originalTime.format('HH:mm');

    if (waveMap[waveKey] && waveMap[waveKey].length < newMaxBookings) {
      waveMap[waveKey].push(appt);
      appt.startTime = waveKey;
      appt.endTime = originalTime.add(waveInterval, 'minute').format('HH:mm');
      appt.isConfirmed = true;
      await this.appointmentRepo.save(appt);
      statuses.push({ id: appt.id, action: `retained-in-wave-${waveKey}` });
    } else {
      let bestWaveTime: dayjs.Dayjs | null = null;
      let minDiff = Number.MAX_SAFE_INTEGER;

      for (const waveStart of waveTimes) {
        const key = waveStart.format('HH:mm');
        const diff = Math.abs(originalTime.diff(waveStart, 'minute'));

        if (waveMap[key].length < newMaxBookings && diff < minDiff) {
          minDiff = diff;
          bestWaveTime = waveStart;
        }
      }

      if (bestWaveTime) {
        const newWaveKey = bestWaveTime.format('HH:mm');
        appt.startTime = newWaveKey;
        appt.endTime = bestWaveTime.add(waveInterval, 'minute').format('HH:mm');
        appt.isConfirmed = true;
        waveMap[newWaveKey].push(appt);
        await this.appointmentRepo.save(appt);
        statuses.push({ id: appt.id, action: `reassigned-from-${waveKey}-to-${newWaveKey}` });
      } else {
        appt.isConfirmed = false;
        await this.appointmentRepo.save(appt);
        statuses.push({ id: appt.id, action: `cancel-inside-no-space` });
      }
    }
  }

  affected.sort((a, b) =>
    dayjs(`${slot.date}T${a.startTime}`).diff(dayjs(`${slot.date}T${b.startTime}`))
  );

  for (const appt of affected) {
    const originalTime = dayjs(`${slot.date}T${appt.startTime}`);

    let bestWaveTime: dayjs.Dayjs | null = null;
    let minDiff = Number.MAX_SAFE_INTEGER;

    for (const waveStart of waveTimes) {
      const waveKey = waveStart.format('HH:mm');
      const diff = Math.abs(originalTime.diff(waveStart, 'minute'));

      if (waveMap[waveKey].length < newMaxBookings && diff < minDiff) {
        minDiff = diff;
        bestWaveTime = waveStart;
      }
    }

    if (bestWaveTime) {
      const waveKey = bestWaveTime.format('HH:mm');
      appt.startTime = waveKey;
      appt.endTime = bestWaveTime.add(waveInterval, 'minute').format('HH:mm');
      appt.isConfirmed = true;
      waveMap[waveKey].push(appt);
      await this.appointmentRepo.save(appt);
      statuses.push({ id: appt.id, action: `rescheduled-wave-${waveKey}` });
    } else {
      appt.isConfirmed = false;
      await this.appointmentRepo.save(appt);
      statuses.push({ id: appt.id, action: 'cancel-or-reschedule' });
    }
  }

  // Update slot info
  slot.endTime = newEnd.format('HH:mm');
  slot.maxBookings = newMaxBookings;
  await this.slotRepo.save(slot);

  return {
    message: 'Slot shrunk in wave mode',
    slotUpdated: {
      newEndTime: slot.endTime,
      newMaxBookings,
    },
    statuses,
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

  const now = dayjs();

  const result: {
    sessionId: number;
    subSlotId: string;
    startTime: string;
    endTime: string;
  }[] = [];

  let latestEndTime: string | null = null;

  for (const session of sessions) {
    const start = dayjs(`${session.date}T${session.startTime}`);
    const end = dayjs(`${session.date}T${session.endTime}`);
    const duration = session.slotDuration;
    const mode = session.mode;
    const max = session.maxBookings ?? 1;

    let t = start;
    while (t.add(duration, 'minute').isSameOrBefore(end)) {
      const st = t;
      const en = t.add(duration, 'minute');

      if (en.isBefore(now)) {
        t = en;
        continue;
      }

      if (mode === 'wave') {
        // Count how many appointments already booked at this exact startTime
        const count = appointments.filter(a =>
          a.slot.id === session.id &&
          a.startTime === st.format('HH:mm')
        ).length;

        if (count < max) {
          result.push({
            sessionId: session.id,
            subSlotId: `${session.id}_${st.format('HHmm')}_${en.format('HHmm')}`,
            startTime: st.format('HH:mm'),
            endTime: en.format('HH:mm'),
          });
        }

      } else {
        // stream mode logic - allow only one booking per sub-slot
        const isBooked = appointments.some(a => {
          return (
            a.slot.id === session.id &&
            st.isBefore(dayjs(`${a.slot.date}T${a.endTime}`)) &&
            en.isAfter(dayjs(`${a.slot.date}T${a.startTime}`))
          );
        });

        if (!isBooked) {
          result.push({
            sessionId: session.id,
            subSlotId: `${session.id}_${st.format('HHmm')}_${en.format('HHmm')}`,
            startTime: st.format('HH:mm'),
            endTime: en.format('HH:mm'),
          });
        }
      }

      latestEndTime = en.format('HH:mm');
      t = en;
    }
  }

  if (result.length === 0) {
    const nextAvailable = await this.findNextAvailableSlot(doctorId, date, latestEndTime || '00:00');

    return {
      message: nextAvailable
        ? `No available slots on ${date}. Next available is on ${nextAvailable.date} at ${nextAvailable.startTime}`
        : 'No available slots found.',
      nextAvailable,
    };
  }

  return result;
}

async checkSlotAvailability(
  doctorId: number,
  date: string,
  startTime: string,
  endTime: string,
  isNextAvailable: boolean,
) {
  const slot = await this.slotRepo.findOne({
    where: {
      doctor: { id: doctorId },
      date,
      startTime,
      endTime,
    },
    relations: ['appointments'],
  });

  if (!slot) throw new NotFoundException('Slot not found');

  const now = dayjs();
  const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
  const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);
  const duration = slot.slotDuration || 10;

  if (slotEnd.isBefore(now)) {
    return { message: 'Slot time has already passed' };
  }

  let isAvailable = false;

  if (slot.mode === 'stream') {
    let t = slotStart;
    while (t.add(duration, 'minute').isSameOrBefore(slotEnd)) {
      const st = t;
      const en = t.add(duration, 'minute');

      const conflict = slot.appointments.some(a =>
        st.isBefore(dayjs(`${slot.date}T${a.endTime}`)) &&
        en.isAfter(dayjs(`${slot.date}T${a.startTime}`))
      );

      if (!conflict) {
        isAvailable = true;
        break;
      }

      t = en;
    }
  } else if (slot.mode === 'wave') {
    let t = slotStart;
    const max = slot.maxBookings ?? 1;

    while (t.add(duration, 'minute').isSameOrBefore(slotEnd)) {
      const timeStr = t.format('HH:mm');
      const count = slot.appointments.filter(a => a.startTime === timeStr).length;

      if (count < max) {
        isAvailable = true;
        break;
      }

      t = t.add(duration, 'minute');
    }
  }

  if (isAvailable) {
    return { message: 'Slot is available' };
  }

  if (isNextAvailable) {
    const nextAvailable = await this.findNextAvailableSlot(doctorId, date, endTime);
    return {
      message: nextAvailable
        ? `Slot is fully booked. Next available slot is on ${nextAvailable.date} at ${nextAvailable.startTime}`
        : 'No upcoming available slots found.',
      nextAvailable,
    };
  }

  return { message: 'Slot is fully booked' };
}

private async findNextAvailableSlot(doctorId: number, fromDate: string, afterTime: string) {
  const after = dayjs(`${fromDate}T${afterTime}`);
  const duration = 10;

  const allSlots = await this.slotRepo.find({
    where: { doctor: { id: doctorId }, date: Not(IsNull()) },
    order: { date: 'ASC', startTime: 'ASC' },
    relations: ['appointments'],
  });

  for (const slot of allSlots) {
    const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
    const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);
    const dur = slot.slotDuration || duration;

    // skip slots before the current check time
    if (slotEnd.isBefore(after)) continue;

    if (slot.mode === 'stream') {
      let t = slotStart;

      while (t.add(dur, 'minute').isSameOrBefore(slotEnd)) {
        const st = t;
        const en = st.add(dur, 'minute');

        if (en.isBefore(after)) {
          t = en;
          continue;
        }

        const conflict = slot.appointments.some(a =>
          st.isBefore(dayjs(`${slot.date}T${a.endTime}`)) &&
          en.isAfter(dayjs(`${slot.date}T${a.startTime}`))
        );

        if (!conflict) {
          return {
            slotId: slot.id,
            date: slot.date,
            startTime: st.format('HH:mm'),
          };
        }

        t = en;
      }

    } else if (slot.mode === 'wave') {
      let t = slotStart;
      const max = slot.maxBookings ?? 1;

      while (t.add(dur, 'minute').isSameOrBefore(slotEnd)) {
        const timeStr = t.format('HH:mm');
        const timeObj = dayjs(`${slot.date}T${timeStr}`);

        if (timeObj.isBefore(after)) {
          t = t.add(dur, 'minute');
          continue;
        }

        const count = slot.appointments.filter(a => a.startTime === timeStr).length;

        if (count < max) {
          return {
            slotId: slot.id,
            date: slot.date,
            startTime: timeStr,
          };
        }

        t = t.add(dur, 'minute');
      }
    }
  }

  return null;
}

async finalizeUrgency(
  appointmentId: number,
  isUrgent: boolean,
  user: any,
): Promise<any> {
  const appointment = await this.appointmentRepo.findOne({
    where: { id: appointmentId, isUrgencyFinalized: false },
    relations: ['slot', 'slot.doctor'],
  });

  if (!appointment) {
    throw new HttpException('Appointment not found or already finalized', HttpStatus.NOT_FOUND);
  }

  if (appointment.slot.doctor.id !== user.id) {
    throw new HttpException('Forbidden: You do not own this appointment\'s slot', HttpStatus.FORBIDDEN);
  }

  if (!isUrgent) {
    const updatedPriority = this.appointmentService.getPriorityFromReason(appointment.reasonCategory);
    appointment.priority = updatedPriority;
    appointment.isUrgencyFinalized = true;
    await this.appointmentRepo.save(appointment);
    return {
      message: 'Marked as non-urgent. Suggest cancel/reschedule.',
      updatedPriority,
    };
  }

  appointment.priority = 1;

  const bufferSlot = await this.slotRepo.findOne({
    where: {
      doctor: appointment.slot.doctor,
      date: appointment.slot.date,
      type: 'buffer',
      isBooked: false,
    },
  });

  if (bufferSlot) {
    appointment.slot = bufferSlot;
    appointment.startTime = bufferSlot.startTime;
    appointment.endTime = bufferSlot.endTime;
    appointment.isConfirmed = true;
    appointment.isUrgencyFinalized = true;

    bufferSlot.isBooked = true;

    await this.appointmentRepo.save(appointment);
    await this.slotRepo.save(bufferSlot);

    return { message: 'Urgent appointment moved to buffer slot successfully.' };
  }

  appointment.isConfirmed = false;
  appointment.isUrgencyFinalized = true;
  await this.appointmentRepo.save(appointment);

  return {
    message: 'No buffer slot available. Appointment marked unconfirmed. Patient should reschedule manually.',
  };
}


}

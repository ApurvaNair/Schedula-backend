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
import { Cron, CronExpression } from '@nestjs/schedule';

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

  // Step 1: Combine inside + affected appointments
  const sortedInside = inside.sort((a, b) => a.id - b.id); // FCFS
  const sortedAffected = affected.sort((a, b) => {
    const aEmergency = a.isUrgencyFinalized === true;
    const bEmergency = b.isUrgencyFinalized === true;
    if (aEmergency !== bEmergency) return aEmergency ? 1 : -1; // emergencies later
    return a.id - b.id;
  });

  const allAppointments = [...sortedInside, ...sortedAffected];

  // Step 2: Calculate valid subslot duration for how many can fit
  const { subslotDuration, finalToFit } = this.calculateSubslotDuration(totalMinutes, allAppointments.length);

  // Step 3: Slice into fitting and overflow groups
  const appointmentsToFit = allAppointments.slice(0, finalToFit);
  const overflowAppointments = allAppointments.slice(finalToFit);

  // Step 4: Reassign subslot times to appointments that fit
  let currentTime = start;
  for (const appointment of appointmentsToFit) {
    const newStart = currentTime;
    const newEndTime = currentTime.add(subslotDuration, 'minute');

    appointment.startTime = newStart.format('HH:mm');
    appointment.endTime = newEndTime.format('HH:mm');

    currentTime = newEndTime;
    await this.appointmentRepo.save(appointment);
  }

  // Step 5: Handle overflow appointments
  for (const appointment of overflowAppointments) {
    if (appointment.isUrgencyFinalized === true) {
      // Emergency – try moving to buffer
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
      // Non-emergency – cancel or ask patient to reschedule
      appointment.isConfirmed = false;
      await this.appointmentRepo.save(appointment);

      statuses.push({
        id: appointment.id,
        action: 'patient-cancel-or-reschedule',
        message: 'Appointment could not be rescheduled automatically. Patient must cancel or choose another time.',
      });
    }
  }

  // Step 6: Remove old buffer appointments (clean up)
  const bufferAppointments = slot.appointments.filter(a => a.slot?.type === 'buffer');
  for (const buffer of bufferAppointments) {
    await this.appointmentRepo.remove(buffer);
  }

  // Step 7: Update slot end time
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
  const waveInterval = slot.slotDuration || 10;

  if (waveInterval < 5) {
    throw new HttpException('Slot duration must be at least 5 minutes', HttpStatus.BAD_REQUEST);
  }

  const waveCount = Math.floor(totalMinutes / waveInterval);

  if (waveCount < 1) {
    throw new HttpException('Not enough time for even one wave', HttpStatus.BAD_REQUEST);
  }

  const newMaxBookings = Math.ceil(totalToFit / waveCount);
  const statuses: { id: number; action: string }[] = [];

  // Generate wave slots
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

  // Pre-fill waveMap with inside appointments
  for (const appt of inside) {
    const waveKey = dayjs(`${slot.date}T${appt.startTime}`).format('HH:mm');
    if (waveMap[waveKey]) {
      waveMap[waveKey].push(appt);
    }
  }

  // Sort affected appointments by original start time (optional)
  affected.sort((a, b) =>
    dayjs(`${slot.date}T${a.startTime}`).diff(dayjs(`${slot.date}T${b.startTime}`))
  );

  for (const appt of affected) {
    const originalTime = dayjs(`${slot.date}T${appt.startTime}`);

    // Find the best (closest) available wave
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
      appt.startTime = bestWaveTime.format('HH:mm');
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

  // Update slot timing and booking cap
  slot.endTime = newEnd.format('HH:mm');
  slot.maxBookings = newMaxBookings;
  await this.slotRepo.save(slot);

  return {
    message: 'Slot shrunk in wave mode',
    slotUpdated: {
      newEndTime: slot.endTime,
      newMaxBookings: newMaxBookings,
    },
    statuses,
  };
}

// async generateSubslots(
//   startTime: Date,
//   endTime: Date,
//   durationInMinutes: number
// ): Promise<{ start: Date; end: Date }[]> {
//   const subslots: { start: Date; end: Date }[] = []; 
//   let current = dayjs(startTime);
//   const end = dayjs(endTime);

//   while (current.add(durationInMinutes, 'minute').isSameOrBefore(end)) {
//     const subslotStart = current.toDate();
//     const subslotEnd = current.add(durationInMinutes, 'minute').toDate();
//     subslots.push({ start: subslotStart, end: subslotEnd });
//     current = current.add(durationInMinutes, 'minute');
//   }

//   return subslots;
// }


// async confirmNewTime(appointmentId: number, confirmedTime: string) {
//   const appointment = await this.appointmentRepo.findOne({
//     where: { id: appointmentId },
//     relations: ['slot'],
//   });

//   if (!appointment) {
//     throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
//   }

//   const now = dayjs();
//   const slot = appointment.slot;
//   const slotDate = slot.date;
//   const confirmTime = dayjs(`${slotDate}T${confirmedTime}`);

//   if (confirmTime.diff(now, 'minute') < 30) {
//     throw new HttpException('Selected time must be at least 30 minutes in the future', HttpStatus.BAD_REQUEST);
//   }

//   const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
//   const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);
//   const slotDuration = slot.slotDuration;

//   const confirmEnd = confirmTime.add(slotDuration, 'minute');

//   if (confirmTime.isBefore(slotStart) || confirmEnd.isAfter(slotEnd)) {
//     throw new HttpException(
//       `Confirmed time must be within slot window: ${slot.startTime} to ${slot.endTime}`,
//       HttpStatus.BAD_REQUEST
//     );
//   }

//   const appointments = await this.appointmentRepo
//     .createQueryBuilder('appointment')
//     .leftJoinAndSelect('appointment.slot', 'slot')
//     .where('slot.id = :slotId', { slotId: slot.id })
//     .andWhere('slot.date = :date', { date: slot.date })
//     .getMany();

//   const availableSubSlots: string[] = [];

//   let t = dayjs(`${slot.date}T${slot.startTime}`);
//   while (t.add(slotDuration, 'minute').isSameOrBefore(slotEnd)) {
//     const st = t; // current slot start
//     const en = t.add(slotDuration, 'minute'); // next slot end

//     const isBooked = appointments.some((a) => {
//       const apptStart = dayjs(`${a.slot.date}T${a.startTime}`);
//       const apptEnd = dayjs(`${a.slot.date}T${a.endTime}`);
//       return (
//         a.id !== appointment.id && 
//         st.isBefore(apptEnd) &&
//         en.isAfter(apptStart)
//       );
//     });

//     if (!isBooked) {
//       availableSubSlots.push(st.format('HH:mm'));
//     }

//     t = t.add(slotDuration, 'minute'); // update time for next iteration
//   }

//   if (!availableSubSlots.includes(confirmedTime)) {
//     throw new HttpException(
//       `Confirmed time must match one of the available sub-slots: ${availableSubSlots.join(', ')}`,
//       HttpStatus.BAD_REQUEST
//     );
//   }

//   appointment.startTime = confirmedTime;
//   appointment.endTime = confirmEnd.format('HH:mm');

//   await this.appointmentRepo.save(appointment);

//   return {
//     message: 'Appointment confirmed with new time',
//     newStartTime: appointment.startTime,
//     newEndTime: appointment.endTime,
//   };
// }

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

  for (const s of sessions) {
    let t = dayjs(`${s.date}T${s.startTime}`);
    const end = dayjs(`${s.date}T${s.endTime}`);

    while (t.isBefore(end)) {
      const st = t;
      const en = t.add(s.slotDuration, 'minute');

      if (en.isAfter(end)) break;

      // Validation 1: Skip expired sub-slots
      if (en.isBefore(now)) {
        t = t.add(s.slotDuration, 'minute');
        continue;
      }

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

// @Cron(CronExpression.EVERY_MINUTE)
// async handleUnconfirmedTimeouts() {
//   const timeoutThreshold = dayjs().subtract(5, 'minute').toDate();

//   const result = await this.appointmentRepo
//     .createQueryBuilder()
//     .delete()
//     .from(Appointment)
//     .where('is_confirmed = false')
//     .andWhere('confirmation_requested_at IS NOT NULL')
//     .andWhere('confirmation_requested_at <= :timeout', { timeout: timeoutThreshold })
//     .execute();

//   if (result.affected && result.affected > 0) {
//     console.log(`Timeout: Removed ${result.affected} unconfirmed appointment(s).`);
//   }
// }

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

  // For urgent case
  appointment.priority = 1;

  // Try moving to buffer slot
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

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
import { Cron, CronExpression } from '@nestjs/schedule';

dayjs.extend(isSameOrBefore);

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

  if (!slot) throw new HttpException('Slot not found', HttpStatus.NOT_FOUND);

  const newEnd = dayjs(`${slot.date}T${newEndTime}`);
  const originalEnd = dayjs(`${slot.date}T${slot.endTime}`);

  if (newEnd.isBefore(dayjs(`${slot.date}T${slot.startTime}`))) {
    throw new HttpException('New end time is before slot start time', HttpStatus.BAD_REQUEST);
  }

  const result: any[] = [];

  slot.endTime = newEndTime;
  await this.slotRepo.save(slot);

  for (const appointment of slot.appointments) {
    const apptStart = dayjs(`${slot.date}T${appointment.startTime}`);
    const apptEnd = dayjs(`${slot.date}T${appointment.endTime}`);
    const apptDuration = apptEnd.diff(apptStart, 'minute');

    if (apptEnd.isAfter(newEnd)) {
      if (appointment.priority === 1 && appointment.isUrgencyFinalized === true) {
        let moved = false;

        const bufferSlot = await this.slotRepo.findOne({
          where: {
            doctor: { id: slot.doctor.id },
            date: slot.date,
            type: 'Buffer',
          },
          relations: ['appointments'],
        });

        if (bufferSlot) {
          const bufferStart = dayjs(`${slot.date}T${bufferSlot.startTime}`);
          const bufferEnd = dayjs(`${slot.date}T${bufferSlot.endTime}`);

          const bufferAppointments = bufferSlot.appointments || [];
          bufferAppointments.sort((a, b) => a.startTime.localeCompare(b.startTime));

          let availableStart = bufferStart;

          for (const appt of bufferAppointments) {
            const apptStart = dayjs(`${slot.date}T${appt.startTime}`);
            const gap = apptStart.diff(availableStart, 'minute');
            if (gap >= apptDuration) {
              break;
            }
            availableStart = dayjs(`${slot.date}T${appt.endTime}`);
          }

          if (bufferEnd.diff(availableStart, 'minute') >= apptDuration) {
            appointment.slot = bufferSlot;
            appointment.startTime = availableStart.format('HH:mm');
            appointment.endTime = availableStart.add(apptDuration, 'minute').format('HH:mm');
            await this.appointmentRepo.save(appointment);
            result.push({
              id: appointment.id,
              patientId: appointment.patient.id,
              actionRequired: 'Moved to buffer slot',
            });
            moved = true;
          }
        }

        if (!moved) {
          const availableSubslots = await this.getAvailableSubSlots(slot.doctor.id, slot.date);

          for (const sub of availableSubslots) {
            const subStart = dayjs(`${slot.date}T${sub.startTime}`);
            const subEnd = dayjs(`${slot.date}T${sub.endTime}`);
            const subDuration = subEnd.diff(subStart, 'minute');

            if (subDuration >= apptDuration) {
              const newSlot = await this.slotRepo.findOne({ where: { id: sub.sessionId } });
              if (!newSlot) {
                throw new HttpException('Session slot not found while reallocating', HttpStatus.INTERNAL_SERVER_ERROR);
              }
              appointment.slot = newSlot;
              appointment.startTime = subStart.format('HH:mm');
              appointment.endTime = subStart.add(apptDuration, 'minute').format('HH:mm');
              await this.appointmentRepo.save(appointment);
              result.push({
                id: appointment.id,
                patientId: appointment.patient.id,
                actionRequired: 'Moved to available subslot',
              });
              moved = true;
              break;
            }
          }
        }

        if (!moved) {
          appointment.isConfirmed = false;
          await this.appointmentRepo.save(appointment);
          result.push({
            id: appointment.id,
            patientId: appointment.patient.id,
            actionRequired: 'Reschedule or cancel required',
          });
        }

      } else {
        appointment.isConfirmed = false;
        appointment.confirmationRequestedAt = new Date();
        await this.appointmentRepo.save(appointment);
        result.push({
          id: appointment.id,
          patientId: appointment.patient.id,
          actionRequired: 'Patient to confirm new time',
        });
      }
    }
  }

  return {
    message: 'Slot shrunk and appointments handled',
    result,
  };
}

async confirmNewTime(appointmentId: number, confirmedTime: string) {
  const appointment = await this.appointmentRepo.findOne({
    where: { id: appointmentId },
    relations: ['slot'],
  });

  if (!appointment) {
    throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
  }

  const now = dayjs();
  const slot = appointment.slot;
  const slotDate = slot.date;
  const confirmTime = dayjs(`${slotDate}T${confirmedTime}`);

  if (confirmTime.diff(now, 'minute') < 30) {
    throw new HttpException('Selected time must be at least 30 minutes in the future', HttpStatus.BAD_REQUEST);
  }

  const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
  const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);
  const slotDuration = slot.slotDuration;

  const confirmEnd = confirmTime.add(slotDuration, 'minute');

  if (confirmTime.isBefore(slotStart) || confirmEnd.isAfter(slotEnd)) {
    throw new HttpException(
      `Confirmed time must be within slot window: ${slot.startTime} to ${slot.endTime}`,
      HttpStatus.BAD_REQUEST
    );
  }

  const appointments = await this.appointmentRepo
    .createQueryBuilder('appointment')
    .leftJoinAndSelect('appointment.slot', 'slot')
    .where('slot.id = :slotId', { slotId: slot.id })
    .andWhere('slot.date = :date', { date: slot.date })
    .getMany();

  const availableSubSlots: string[] = [];

  let t = dayjs(`${slot.date}T${slot.startTime}`);
  while (t.add(slotDuration, 'minute').isSameOrBefore(slotEnd)) {
    const st = t; // current slot start
    const en = t.add(slotDuration, 'minute'); // next slot end

    const isBooked = appointments.some((a) => {
      const apptStart = dayjs(`${a.slot.date}T${a.startTime}`);
      const apptEnd = dayjs(`${a.slot.date}T${a.endTime}`);
      return (
        a.id !== appointment.id && 
        st.isBefore(apptEnd) &&
        en.isAfter(apptStart)
      );
    });

    if (!isBooked) {
      availableSubSlots.push(st.format('HH:mm'));
    }

    t = t.add(slotDuration, 'minute'); // update time for next iteration
  }

  if (!availableSubSlots.includes(confirmedTime)) {
    throw new HttpException(
      `Confirmed time must match one of the available sub-slots: ${availableSubSlots.join(', ')}`,
      HttpStatus.BAD_REQUEST
    );
  }

  appointment.startTime = confirmedTime;
  appointment.endTime = confirmEnd.format('HH:mm');

  await this.appointmentRepo.save(appointment);

  return {
    message: 'Appointment confirmed with new time',
    newStartTime: appointment.startTime,
    newEndTime: appointment.endTime,
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

@Cron(CronExpression.EVERY_MINUTE)
async handleUnconfirmedTimeouts() {
  const timeoutThreshold = dayjs().subtract(5, 'minute').toDate();

  const result = await this.appointmentRepo
    .createQueryBuilder()
    .delete()
    .from(Appointment)
    .where('is_confirmed = false')
    .andWhere('confirmation_requested_at IS NOT NULL')
    .andWhere('confirmation_requested_at <= :timeout', { timeout: timeoutThreshold })
    .execute();

  if (result.affected && result.affected > 0) {
    console.log(`Timeout: Removed ${result.affected} unconfirmed appointment(s).`);
  }
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

  let message: string;

  if (!isUrgent) {
    const updatedPriority = this.appointmentService.getPriorityFromReason(appointment.reasonCategory);
    appointment.priority = updatedPriority;
    appointment.isUrgencyFinalized = true;
    await this.appointmentRepo.save(appointment);
    return {
      message: 'Marked as non-urgent. Suggest Cancel/Reschedule.',
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

  const allAvailableSubslots = await this.getAvailableSubSlots(
    appointment.slot.doctor.id,
    appointment.slot.date,
  );

  const now = new Date();
  const filteredSubslots = allAvailableSubslots.filter((subslot) => {
    const [hour, minute] = subslot.startTime.split(':').map(Number);
    const subslotDateTime = new Date(appointment.slot.date);
    subslotDateTime.setHours(hour, minute, 0, 0);
    const diffMinutes = (subslotDateTime.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes >= 30;
  });

  if (filteredSubslots.length === 0) {
    appointment.isConfirmed = false;
    appointment.isUrgencyFinalized = true;
    await this.appointmentRepo.save(appointment);
    return {
      message: 'No suitable sub-slots. Patient must reschedule or cancel.',
    };
  }

  if (filteredSubslots.length === 1) {
    const chosenSubslot = filteredSubslots[0];
    const finalSlot = await this.slotRepo.findOne({
      where: { id: Number(chosenSubslot.subSlotId) },
    });

    if (!finalSlot) {
      throw new HttpException('Chosen sub-slot not found', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    appointment.slot = finalSlot;
    appointment.startTime = finalSlot.startTime;
    appointment.endTime = finalSlot.endTime;
    appointment.isConfirmed = false;
    appointment.isUrgencyFinalized = true;
    await this.appointmentRepo.save(appointment);

    return {
      message: 'Urgent appointment moved to sub-slot. Awaiting patient confirmation.',
      suggestedSlot: chosenSubslot,
    };
  }

  appointment.isConfirmed = false;
  appointment.isUrgencyFinalized = true;
  await this.appointmentRepo.save(appointment);

  return {
    message: 'Multiple sub-slots available. Patient must choose one.',
    suggestedSlots: filteredSubslots,
  };
}


}

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { Slot } from 'src/availability/entities/slot.entity';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patients/entities/patient.entity';
import dayjs from 'dayjs';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,

    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,

    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
  ) {}

  public reasonPriorityMap = {
  'Concerning Symptoms': 1,
  'Acute Illness': 2,
  'Mild Issue': 3,
  'Follow up': 4,
  'General Check-up / Other': 5,
};

  public getPriorityFromReason(reason: string): number {
    return this.reasonPriorityMap[reason] ?? 5;
  }

  async bookAppointment(dto: BookAppointmentDto): Promise<Appointment> {
    const { slotId, patientId, reasonCategory, reasonDescription, startTime, endTime } = dto;

    const slot = await this.slotRepo.findOne({ where: { id: slotId }, relations: ['doctor'] });
    if (!slot) throw new HttpException('Slot session not found', HttpStatus.NOT_FOUND);

    const now = dayjs();
    const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
    const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);
    const bookingOpenTime = slotStart.subtract(2, 'hour');
    const bookingCloseTime = slotEnd.subtract(30, 'minute');

    // if (now.isBefore(bookingOpenTime) || now.isAfter(bookingCloseTime)) {
    //   throw new HttpException(
    //     'Booking not allowed outside the booking window (starts 2 hours before and ends 30 minutes before slot)',
    //     HttpStatus.FORBIDDEN,
    //   );
    // }

    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);

    if (slot.type === 'buffer') {
      throw new HttpException('Cannot book a buffer slot directly', HttpStatus.BAD_REQUEST);
    }

    const duplicateDayBooking = await this.appointmentRepo.findOne({
      where: {
        patient: { id: patientId },
        slot: { date: slot.date },
      },
      relations: ['slot'],
    });
    if (duplicateDayBooking) {
      throw new HttpException('Patient already has an appointment on this day', HttpStatus.CONFLICT);
    }

    const start = dayjs(`${slot.date}T${startTime}`);
    const end = dayjs(`${slot.date}T${endTime}`);

    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
      throw new HttpException('Invalid time range', HttpStatus.BAD_REQUEST);
    }

    if (start.isBefore(slotStart) || end.isAfter(slotEnd)) {
      throw new HttpException('Appointment time is outside the current slot window', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.appointmentRepo.findOne({
      where: {
        slot: { id: slot.id },
        startTime,
        endTime,
      },
      relations: ['slot'],
    });
    if (existing) {
      throw new HttpException('This slot is already booked. Please choose another time.', HttpStatus.CONFLICT);
    }

    const existingAppointment = await this.appointmentRepo.findOne({
      where: {
        slot: { id: slotId },
        patient: { id: patientId },
      },
    });

    if (existingAppointment) {
      throw new HttpException('Patient already has an appointment for this slot', HttpStatus.CONFLICT);
    }

    const priority = this.getPriorityFromReason(reasonCategory);

    const appointment = this.appointmentRepo.create({
      patient,
      slot,
      startTime,
      endTime,
      reasonCategory,
      reasonDescription: reasonDescription || '',
      priority,
      isUrgencyFinalized: false,
    });

    return await this.appointmentRepo.save(appointment);
  }

  async getDoctorAppointmentsByDate(doctorId: number, date: string) {
    return this.appointmentRepo.find({
      where: {
        slot: {
          doctor: { id: doctorId },
          date,
        },
      },
      relations: ['slot', 'patient'],
      order: { startTime: 'ASC' },
    });
  }

 async patientReschedule(
  appointmentId: number,
  newSlotId: number,
  newStartTime: string,
  newEndTime: string,
) {
  const appointment = await this.appointmentRepo.findOne({
    where: { id: appointmentId },
    relations: ['slot'],
  });

  const newSlot = await this.slotRepo.findOne({ where: { id: newSlotId } });
  if (!appointment || !newSlot) {
    throw new HttpException('Invalid appointment or slot', HttpStatus.NOT_FOUND);
  }

  const slotStart = dayjs(`${newSlot.date}T${newSlot.startTime}`);
  const slotEnd = dayjs(`${newSlot.date}T${newSlot.endTime}`);
  const now = dayjs();

  // Allow only if new slot is not expired
  const slotHasEnded = slotEnd.isBefore(now);
  if (slotHasEnded) {
    throw new HttpException('Cannot reschedule into an expired slot', HttpStatus.BAD_REQUEST);
  }

  const newStart = dayjs(`${newSlot.date}T${newStartTime}`);
  const newEnd = dayjs(`${newSlot.date}T${newEndTime}`);

  if (!newStart.isValid() || !newEnd.isValid() || !newEnd.isAfter(newStart)) {
    throw new HttpException('Invalid reschedule time range', HttpStatus.BAD_REQUEST);
  }

  if (newStart.isBefore(slotStart) || newEnd.isAfter(slotEnd)) {
    throw new HttpException('New appointment time is outside the slot window', HttpStatus.BAD_REQUEST);
  }

  const conflict = await this.appointmentRepo.findOne({
    where: {
      slot: { id: newSlot.id },
      startTime: newStartTime,
      endTime: newEndTime,
    },
  });
  if (conflict) {
    throw new HttpException('New time already booked', HttpStatus.CONFLICT);
  }

  appointment.slot = newSlot;
  appointment.startTime = newStartTime;
  appointment.endTime = newEndTime;

  return await this.appointmentRepo.save(appointment);
}

  async cancelAppointment(id: number) {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    return this.appointmentRepo.remove(appt);
  }
}

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

  private reasonPriorityMap = {
    'Chest Pain': 1,
    'Accident': 1,
    'Fever': 2,
    'Headache': 3,
    'Follow-up': 4,
    'General Consultation': 5,
    'Other': 5,
  };

  async bookAppointment(dto: BookAppointmentDto): Promise<Appointment> {
    const { slotId, patientId, reasonCategory, reasonDescription, startTime, endTime } = dto;

    const slot = await this.slotRepo.findOne({
      where: { id: slotId },
      relations: ['doctor'],
    });
    if (!slot) throw new HttpException('Slot session not found', HttpStatus.NOT_FOUND);

    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);

    const start = dayjs(`${slot.date}T${startTime}`);
    const end = dayjs(`${slot.date}T${endTime}`);
    const slotStart = dayjs(`${slot.date}T${slot.startTime}`);
    const slotEnd = dayjs(`${slot.date}T${slot.endTime}`);

    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
      throw new HttpException('Invalid time range', HttpStatus.BAD_REQUEST);
    }

    if (start.isBefore(slotStart) || end.isAfter(slotEnd)) {
      throw new HttpException('Booking outside availability window', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.appointmentRepo.findOne({
      where: {
        slot: { id: slot.id },
        startTime,
        endTime,
      },
    });
    if (existing) {
      throw new HttpException('Sub-slot already booked', HttpStatus.CONFLICT);
    }

    const priority = this.reasonPriorityMap[reasonCategory] ?? 5;

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

    return this.appointmentRepo.save(appointment);
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

    const newStart = dayjs(`${newSlot.date}T${newStartTime}`);
    const newEnd = dayjs(`${newSlot.date}T${newEndTime}`);
    const slotStart = dayjs(`${newSlot.date}T${newSlot.startTime}`);
    const slotEnd = dayjs(`${newSlot.date}T${newSlot.endTime}`);

    if (newStart.isBefore(slotStart) || newEnd.isAfter(slotEnd)) {
      throw new HttpException('New time out of slot window', HttpStatus.BAD_REQUEST);
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
    return this.appointmentRepo.save(appointment);
  }

  async cancelAppointment(id: number) {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    return this.appointmentRepo.remove(appt);
  }

  async finalizeUrgency(appointmentId: number, finalPriority: number): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appointment) {
      throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    }

    appointment.priority = finalPriority;
    appointment.isUrgencyFinalized = true;
    return this.appointmentRepo.save(appointment);
  }
}

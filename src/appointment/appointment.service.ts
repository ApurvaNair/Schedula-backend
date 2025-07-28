import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { Slot } from 'src/availability/entities/slot.entity';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patients/entities/patient.entity';
import dayjs from 'dayjs';
import { ConfirmBufferDto } from './dto/confirm-buffer.dto';

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

     const existingAppointment = await this.appointmentRepo.findOne({
  where: {
    slot: { id: slotId },
    patient: { id: patientId },
  },
});

if (existingAppointment) {
  throw new HttpException('Patient already has an appointment for this slot', HttpStatus.CONFLICT);
}
    const slot = await this.slotRepo.findOne({ where: { id: slotId }, relations: ['doctor'] });
    if (!slot) throw new HttpException('Slot session not found', HttpStatus.NOT_FOUND);

    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);

     const duplicateBooking = await this.appointmentRepo.findOne({
    where: {
      patient: { id: patientId },
      slot: {
        date: slot.date, 
      },
    },
    relations: ['slot'],
  });

  if (duplicateBooking) {
    throw new HttpException('Patient already has an appointment on this day', HttpStatus.CONFLICT);
  }

    const start = dayjs(`${slot.date}T${startTime}`);
    const end = dayjs(`${slot.date}T${endTime}`);
    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
      throw new HttpException('Invalid time range', HttpStatus.BAD_REQUEST);
    }

    const priority = this.reasonPriorityMap[reasonCategory] ?? 5;

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

    return await this.appointmentRepo.save(appointment);
  }

  async cancelAppointment(id: number) {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    return this.appointmentRepo.remove(appt);
  }

  async confirmBufferSlot(dto: ConfirmBufferDto) {
    const { slotId, patientId, startTime, endTime, reasonCategory, reasonDescription, priority } = dto;

    const slot = await this.slotRepo.findOne({ where: { id: slotId } });
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });

    if (!slot || !patient) {
      throw new HttpException('Invalid slot or patient', HttpStatus.BAD_REQUEST);
    }

    const conflict = await this.appointmentRepo.findOne({
      where: {
        slot: slot,
        startTime: startTime,
      },
    });

    if (conflict) {
      throw new HttpException('Buffer slot already booked', HttpStatus.CONFLICT);
    }

    const appointment = this.appointmentRepo.create({
      patient,
      slot,
      startTime,
      endTime,
      reasonCategory,
      reasonDescription: reasonDescription || '',
      isUrgencyFinalized: false,
    });

    return await this.appointmentRepo.save(appointment);
  }
}

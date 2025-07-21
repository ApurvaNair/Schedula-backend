import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { Slot } from 'src/availability/entities/slot.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patients/entities/patient.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAllDto } from './dto/reschedule-all.dto';
import { RescheduleSelectedDto } from './dto/reschedule-selected.dto';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(Slot)
    private readonly slotRepo: Repository<Slot>,

    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,

    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  async createSlot(dto: CreateSlotDto) {
    const doctor = await this.doctorRepo.findOne({ where: { id: dto.doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    // Check for overlapping slots
    const overlapping = await this.slotRepo.findOne({
      where: {
        doctor: { id: dto.doctorId },
        date: dto.date,
        startTime: Between(dto.startTime, dto.endTime),
        endTime: Between(dto.startTime, dto.endTime),
      },
    });
    if (overlapping) throw new ConflictException('Overlapping slot exists');

    const slot = this.slotRepo.create({ ...dto, doctor });
    return this.slotRepo.save(slot);
  }

  async bookAppointment(dto: BookAppointmentDto) {
    const slot = await this.slotRepo.findOne({
      where: { id: dto.slotId },
      relations: ['appointments'],
    });
    if (!slot) throw new NotFoundException('Slot not found');

    const patient = await this.patientRepo.findOne({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const currentCount = await this.appointmentRepo.count({
      where: { slot: { id: slot.id } },
    });

    if (slot.mode === 'stream' && currentCount > 0) {
      throw new ConflictException('Stream slot already booked');
    }

    if (slot.mode === 'wave' && currentCount >= slot.maxBookings) {
      throw new ConflictException('Wave slot is full');
    }

    const appointment = this.appointmentRepo.create({
      slot,
      patientId: patient.id,
      reason: dto.reason,
    });

    return this.appointmentRepo.save(appointment);
  }

  async patientReschedule(appointmentId: number, newSlotId: number) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['slot'],
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const newSlot = await this.slotRepo.findOne({
      where: { id: newSlotId },
      relations: ['appointments'],
    });
    if (!newSlot) throw new NotFoundException('New slot not found');

    const count = await this.appointmentRepo.count({
      where: { slot: { id: newSlotId } },
    });

    if (newSlot.mode === 'stream' && count > 0) {
      throw new ConflictException('New stream slot already booked');
    }

    if (newSlot.mode === 'wave' && count >= newSlot.maxBookings) {
      throw new ConflictException('New wave slot is full');
    }

    appointment.slot = newSlot;
    return this.appointmentRepo.save(appointment);
  }

  async rescheduleAll(dto: RescheduleAllDto) {
    const slots = await this.slotRepo.find({
      where: { doctor: { id: dto.doctorId } },
    });

    for (const slot of slots) {
      slot.startTime = this.shiftTime(slot.startTime, dto.shiftMinutes);
      slot.endTime = this.shiftTime(slot.endTime, dto.shiftMinutes);
      await this.slotRepo.save(slot);
    }

    return { message: 'All slots rescheduled' };
  }

 async rescheduleSelected(dto: RescheduleSelectedDto) {
  const appointments = await Promise.all(
    dto.appointmentIds.map((id) =>
      this.appointmentRepo.findOne({
        where: { id },
        relations: ['slot'],
      })
    )
  );
     for (const appt of appointments) {
    if (!appt || !appt.slot) continue;
    appt.slot.startTime = this.shiftTime(appt.slot.startTime, dto.shiftMinutes);
    appt.slot.endTime = this.shiftTime(appt.slot.endTime, dto.shiftMinutes);
    await this.slotRepo.save(appt.slot);
  }

  return { message: 'Selected appointments rescheduled' };
}

  async cancelAppointment(id: number) {
    const appointment = await this.appointmentRepo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    await this.appointmentRepo.remove(appointment);
    return { message: 'Appointment cancelled' };
  }

  private shiftTime(time: string, minutes: number): string {
    const [hour, min] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hour, min + minutes);
    return date.toTimeString().slice(0, 5); // returns 'HH:MM'
  }
}

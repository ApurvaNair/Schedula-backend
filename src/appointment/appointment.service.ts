import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slot } from 'src/availability/entities/slot.entity';
import { Appointment } from './entities/appointment.entity';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAllDto } from './dto/reschedule-all.dto';
import { RescheduleSelectedDto } from './dto/reschedule-selected.dto';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Slot) private slotRepo: Repository<Slot>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
  ) {}

  async createSlot(dto: CreateSlotDto) {
    return await this.slotRepo.save({
      ...dto,
      doctor: { id: dto.doctorId },
    });
  }

  async bookAppointment(dto: BookAppointmentDto) {
    const slot = await this.slotRepo.findOne({
      where: { id: dto.slotId },
      relations: ['appointments'],
    });
    if (!slot) throw new NotFoundException('Slot not found');

    if (slot.mode === 'stream' && slot.appointments.length >= 1)
      throw new ConflictException('Slot already booked (stream mode)');

    if (slot.mode === 'wave' && slot.appointments.length >= slot.maxBookings)
      throw new ConflictException('Slot full (wave mode)');

    const appointment = this.appointmentRepo.create({
      patientId: dto.patientId,
      reason: dto.reason,
      slot,
    });

    return await this.appointmentRepo.save(appointment);
  }

  async cancelAppointment(id: number) {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Appointment not found');
    return await this.appointmentRepo.remove(appt);
  }

  async viewAppointmentsByPatient(patientId: number) {
    return await this.appointmentRepo.find({
      where: { patientId },
      relations: ['slot'],
    });
  }

  async viewAppointmentsByDoctor(doctorId: number) {
    const slots = await this.slotRepo.find({
      where: { doctor: { id: doctorId } },
      relations: ['appointments'],
    });

    return slots.flatMap((slot) =>
      slot.appointments.map((appt) => ({
        ...appt,
        slot,
      })),
    );
  }

  async rescheduleAll(dto: RescheduleAllDto) {
    const slots = await this.slotRepo.find({ where: { doctor: { id: dto.doctorId } } });

    for (const slot of slots) {
      slot.startTime = this.shiftTime(slot.startTime, dto.shiftMinutes);
      slot.endTime = this.shiftTime(slot.endTime, dto.shiftMinutes);
      await this.slotRepo.save(slot);
    }

    return { message: 'All slots shifted' };
  }

  async rescheduleSelected(dto: RescheduleSelectedDto) {
    for (const id of dto.appointmentIds) {
      const appt = await this.appointmentRepo.findOne({ where: { id }, relations: ['slot'] });
      if (appt) {
        const slot = appt.slot;
        slot.startTime = this.shiftTime(slot.startTime, dto.shiftMinutes);
        slot.endTime = this.shiftTime(slot.endTime, dto.shiftMinutes);
        await this.slotRepo.save(slot);
      }
    }

    return { message: 'Selected appointments shifted' };
  }

  private shiftTime(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + minutes);
    return date.toTimeString().substring(0, 5);
  }
}

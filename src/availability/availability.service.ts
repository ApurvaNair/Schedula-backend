import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slot } from './entities/slot.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Slot)
    private slotRepository: Repository<Slot>,

    @InjectRepository(Doctor)
    private doctorRepository: Repository<Doctor>,
  ) {}

  async getDoctorById(id: number): Promise<Doctor> {
    const doctor = await this.doctorRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return doctor;
  }

  async getDoctorSlots(doctorId: number): Promise<Slot[]> {
    return this.slotRepository.find({
      where: { doctor: { id: doctorId } },
    });
  }

  async createSlot(
    doctorId: number,
    slotData: {
      date: string;
      startTime: string;
      endTime: string;
      mode: string;
      maxBookings: number;
    },
  ): Promise<Slot> {
    const doctor = await this.getDoctorById(doctorId);

    const slot = this.slotRepository.create({
      ...slotData,
      doctor,
    });

    return this.slotRepository.save(slot);
  }

  async deleteSlot(
    slotId: number,
    doctorId: number,
  ): Promise<{ message: string }> {
    const slot = await this.slotRepository.findOne({
      where: { id: slotId, doctor: { id: doctorId } },
    });

    if (!slot) {
      throw new NotFoundException(
        'Slot not found or does not belong to the doctor',
      );
    }

    await this.slotRepository.remove(slot);

    return { message: 'Slot deleted successfully' };
  }
}

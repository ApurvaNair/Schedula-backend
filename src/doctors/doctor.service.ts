import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Doctor } from './entities/doctor.entity';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
  ) {}

  async getDoctorById(id: string) {
    const doctor = await this.doctorRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!doctor) throw new NotFoundException('Doctor not found');

    const { user, ...rest } = doctor;
    return rest;
  }

  async listDoctors(first_name?: string, specialization?: string) {
    const where: any = {};

    if (first_name) where.name = ILike(`%${first_name}%`);
    if (specialization) where.specialization = ILike(`%${specialization}%`);

    const doctors = await this.doctorRepo.find({ where });

    return doctors.map(({ user, ...rest }) => rest);
  }

  async getDoctorProfileByUserId(userId: string) {
    const doctor = await this.doctorRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const { user, ...rest } = doctor;
    return rest;
  }

  async updateDoctorProfile(userId: string, dto: UpdateDoctorDto) {
    const doctor = await this.doctorRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!doctor) throw new NotFoundException('Doctor profile not found');

    Object.assign(doctor, dto);

    const updated = await this.doctorRepo.save(doctor);

    const { user, ...rest } = updated;
    return rest;
  }
}

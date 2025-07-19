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

  async getDoctorById(id: number) {
    const doctor = await this.doctorRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async listDoctors(first_name?: string, specialization?: string) {
    const where: any = {};
    if (first_name) where.name = ILike(`%${first_name}%`);
    if (specialization) where.specialization = ILike(`%${specialization}%`);

    return this.doctorRepo.find({ where });
  }

  async getDoctorProfileByUserId(userId: number) {
    const doctor = await this.doctorRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    return doctor;
  }

  async updateDoctorProfile(userId: number, dto: UpdateDoctorDto) {
    const doctor = await this.getDoctorProfileByUserId(userId);
    Object.assign(doctor, dto);
    return this.doctorRepo.save(doctor);
  }
}

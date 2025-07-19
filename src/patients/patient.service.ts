import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(updatePatientDto: UpdatePatientDto): Promise<Patient> {
    const { userId, ...patientDetails } = updatePatientDto;

    if (!userId) {
      throw new NotFoundException('userId is required to create a patient');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const patient = this.patientRepo.create({
      ...patientDetails,
      user,
    });

    return await this.patientRepo.save(patient);
  }

  async findAll(): Promise<Patient[]> {
    return await this.patientRepo.find({
      relations: ['user'],
    });
  }

  async findOne(id: number): Promise<Patient> {
    const patient = await this.patientRepo.findOne({
      where: { user:{id} },
      relations: ['user'],
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  async update(id: number, updatePatientDto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findOne(id);

    const updatedPatient = this.patientRepo.merge(patient, updatePatientDto);

    return await this.patientRepo.save(updatedPatient);
  }

  async remove(id: number): Promise<void> {
    const patient = await this.findOne(id);
    await this.patientRepo.remove(patient);
  }

  async updateByUserId(userId: number, updateDto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.patientRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!patient) {
      throw new NotFoundException(`Patient with user ID ${userId} not found`);
    }

    Object.assign(patient, updateDto);

    return this.patientRepo.save(patient);
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

import { User } from '../users/entities/user.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,

    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,

    private jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto, role: 'doctor' | 'patient') {
    const exists = await this.userRepo.findOne({
      where: { emailID: dto.emailID },
    });
    if (exists) throw new ConflictException('Email already exists');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      name: dto.name,
      emailID: dto.emailID,
      password: hashed,
      role,
    });

    const savedUser = await this.userRepo.save(user);

    if (role === 'doctor') {
      const doctor = this.doctorRepo.create({
        user: savedUser,
        name: savedUser.name,
      });
      await this.doctorRepo.save(doctor);
    } else if (role === 'patient') {
      const patient = this.patientRepo.create({
        user: savedUser,
        name:savedUser.name,
});
await this.patientRepo.save(patient);
    }

    return {
      message: 'Signup successful',
      userId: savedUser.id,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { emailID: dto.emailID },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Wrong credentials');
    }
    
    const token = this.jwtService.sign({
      sub: user.id,
      role: user.role,
      name: user.name,
      emailID: user.emailID,
    });

    return {
      message: 'Login successful',
      token
    };
  }

  async logout() {
    return { message: 'Logged out successfully' };
  }
}

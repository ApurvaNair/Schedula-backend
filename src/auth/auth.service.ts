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
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto, role: 'doctor' | 'patient') {
    const exists = await this.userRepo.findOne({
      where: { email: dto.emailID },
    });

    if (exists) {
      throw new ConflictException('Email already exists');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      ...dto,
      password: hashed,
      role, 
    });
    
    const saved = await this.userRepo.save(user);
    return {
      message: 'Signup successful',
      userId: saved.id,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.emailID },
    });
    console.log('Login payload:', dto);
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Wrong credentials');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      role: user.role, 
    });

    console.log('\n🔐 JWT Token for testing:\nBearer ' + token + '\n');

    return { message: 'Login successful' };
  }

  async logout() {
    return { message: 'Logged out successfully' };
  }
}

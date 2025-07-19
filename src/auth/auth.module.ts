import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from './jwt.strategy';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from 'src/patients/entities/patient.entity';


const jwtSecret = process.env.JWT_SECRET 
console.log('JWT_SECRET loaded:', jwtSecret);

@Module({
  imports: [
    TypeOrmModule.forFeature([User,Doctor,Patient]),
    PassportModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

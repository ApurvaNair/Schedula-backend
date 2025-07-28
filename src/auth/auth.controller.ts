import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

@Controller('api')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('auth/patient/register')
  signupPatient(@Body() dto: SignupDto) {
    return this.authService.signup(dto, 'patient');
  }

  @Post('auth/doctor/register')
  signupDoctor(@Body() dto: SignupDto) {
    return this.authService.signup(dto, 'doctor');
  }

  @Post('auth/login')
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(loginDto);
    const token = result.token;

    res.setHeader('Authorization', `Bearer ${token}`);
    return res.send({ message: 'Login successful' });
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/logout')
  logout() {
    return this.authService.logout();
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('doctor/profile')
  @Roles('doctor')
  getDoctorProfile(@Req() req: any) {
    return { message: 'Doctor-only content', user: req.user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('patient/profile')
  @Roles('patient')
  getPatientProfile(@Req() req: any) {
    return { message: 'Patient-only content', user: req.user };
  }
}

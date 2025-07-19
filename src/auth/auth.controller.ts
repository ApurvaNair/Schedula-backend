import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
}

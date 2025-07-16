import {
  Controller,
  Get,
  Req,
  Query,
  Param,
  Patch,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DoctorService } from './doctor.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { Request } from 'express';

@Controller('api/doctors')
export class DoctorController {
  constructor(private doctorService: DoctorService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    const user: any = req.user;
    if (user.role !== 'doctor') throw new ForbiddenException('Access denied');

    return this.doctorService.getDoctorProfileByUserId(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateDoctor(@Req() req: any, @Body() dto: UpdateDoctorDto) {
    const user: any = req.user;
    if (user.role !== 'doctor') throw new ForbiddenException('Access denied');

    return this.doctorService.updateDoctorProfile(user.userId, dto);
  }

  @Get('/')
  listDoctors(
    @Query('first_name') first_name?: string,
    @Query('specialization') specialization?: string,
  ) {
    return this.doctorService.listDoctors(first_name, specialization);
  }

  @Get('/:id')
  getDoctor(@Param('id') id: string) {
    return this.doctorService.getDoctorById(id);
  }
}

import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('api/doctors')
export class DoctorController {
  constructor(private doctorService: DoctorService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getOwnProfile(@Req() req: any) {
    if (req.user.role !== 'doctor') {
      throw new ForbiddenException('Only doctors can access this resource');
    }

    return this.doctorService.getDoctorProfileByUserId(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateDoctorDto) {
    if (req.user.role !== 'doctor') {
      throw new ForbiddenException('Only doctors can update their profile');
    }

    return this.doctorService.updateDoctorProfile(req.user.id, dto);
  }

  @Get()
  async listDoctors(
    @Query('first_name') first_name?: string,
    @Query('specialization') specialization?: string,
  ) {
    return this.doctorService.listDoctors(first_name, specialization);
  }

  @Get(':id')
  async getDoctor(@Param('id') id: number) {
    return this.doctorService.getDoctorById(id);
  }
}

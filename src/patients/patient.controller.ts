import { Controller, Get, Param, Patch, Body, NotFoundException } from '@nestjs/common';
import { PatientService} from './patient.service';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Controller('api/patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Get(':id')
  async findOne(@Param('id') id: number) {
    const patient = await this.patientService.findOne(+id);
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() updatePatientDto: UpdatePatientDto) {
    return this.patientService.update(+id, updatePatientDto);
  }
}

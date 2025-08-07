import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BookAppointmentDto {
  @IsNotEmpty()
  slotId: number;

  @IsNotEmpty()
  patientId: number;

  @IsNotEmpty()
  @IsString()
  reasonCategory: string;

  @IsOptional()
  @IsString()
  reasonDescription?: string;

  @IsNotEmpty()
  startTime: string;

  @IsNotEmpty()
  endTime: string;
}

import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class BookAppointmentDto {
  @IsInt()
  patientId: number;

  @IsInt()
  slotId: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

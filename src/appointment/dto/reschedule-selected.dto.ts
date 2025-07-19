import { IsArray, IsNumber, ArrayNotEmpty } from 'class-validator';

export class RescheduleSelectedDto {
  @IsArray()
  @ArrayNotEmpty()
  appointmentIds: number[];

  @IsNumber()
  shiftMinutes: number;
}

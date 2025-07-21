import { IsArray, IsInt, ArrayNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class RescheduleSelectedDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  appointmentIds: number[];

  @IsInt()
  shiftMinutes: number;
}

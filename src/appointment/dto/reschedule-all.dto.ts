import { IsInt } from 'class-validator';

export class RescheduleAllDto {
  @IsInt()
  doctorId: number;

  @IsInt()
  shiftMinutes: number;
}

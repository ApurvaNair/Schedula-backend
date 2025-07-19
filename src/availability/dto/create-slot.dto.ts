import { IsString, IsInt, IsDateString, Matches, Min } from 'class-validator';

export class CreateSlotDto {
  @IsDateString()
  date: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime: string;

  @IsString()
  mode: string;

  @IsInt()
  @Min(1)
  maxBookings: number;
}

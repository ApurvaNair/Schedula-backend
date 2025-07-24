import { IsInt, IsString, IsEnum, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateSlotDto {
  @IsInt()
  doctorId: number;

  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsEnum(['stream', 'wave'])
  mode: 'stream' | 'wave';

  @IsInt()
  maxBookings: number;
}

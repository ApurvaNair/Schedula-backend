import {
  IsString,
  IsInt,
  IsDateString,
  Matches,
  Min,
  IsIn,
  ValidateIf,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateSlotDto {
  @ValidateIf((o) => !o.startDate)
  @IsDateString()
  date?: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid startTime format' })
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid endTime format' })
  endTime: string;

  @IsIn(['stream', 'wave'], { message: 'Mode must be either stream or wave' })
  mode: string;

  @IsInt()
  @Min(1)
  slotDuration: number;

  @ValidateIf((o) => o.mode === 'wave')
  @IsInt({ message: 'maxBookings must be an integer' })
  @Min(1, { message: 'maxBookings must be at least 1 for wave mode' })
  maxBookings?: number;

  @ValidateIf((o) => !o.date) 
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ValidateIf((o) => !o.date)
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ValidateIf((o) => !o.date && o.startDate && o.endDate)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'daysOfWeek should not be empty if provided' })
  daysOfWeek?: string[];
}

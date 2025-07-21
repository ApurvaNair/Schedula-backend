import {
  IsString,
  IsInt,
  IsDateString,
  Matches,
  Min,
  IsIn,
  ValidateIf,
} from 'class-validator';

export class CreateSlotDto {
  @IsDateString()
  date: string;

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
}

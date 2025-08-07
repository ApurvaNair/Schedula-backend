import { IsNotEmpty, IsString, IsInt } from 'class-validator';

export class ConfirmBufferDto {
  @IsInt()
  slotId: number;

  @IsInt()
  patientId: number;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsNotEmpty()
    @IsString()
    reasonCategory: string;
  
   @IsString()
   reasonDescription?: string;

  @IsInt()
  priority: number;
}

export class CreateSlotDto {
  doctorId: number;
  date: string;
  startTime: string;
  endTime: string;
  mode: 'stream' | 'wave';
  maxBookings: number;
}

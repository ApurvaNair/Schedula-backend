import { Slot } from 'src/availability/entities/slot.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity({ name: 'appointment' })
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patientId: number;

  @Column()
  reason: string;

  @ManyToOne(() => Slot, (slot) => slot.appointments, { onDelete: 'CASCADE' })
  slot: Slot;
}

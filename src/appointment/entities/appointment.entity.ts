import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Slot } from 'src/availability/entities/slot.entity';
import { Patient } from 'src/patients/entities/patient.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Slot, (slot) => slot.appointments, { eager: true })
  slot: Slot;

  @ManyToOne(() => Patient, (patient) => patient.appointments, { eager: true })
  patient: Patient;

  @Column()
  reasonCategory: string;

  @Column({ nullable: true })
  reasonDescription: string;

  @Column()
  priority: number;

  @Column({ default: false })
  isUrgencyFinalized: boolean;

  @Column()
  startTime: string;

  @Column()
  endTime: string;
}

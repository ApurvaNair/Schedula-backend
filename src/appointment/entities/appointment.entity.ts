import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Slot } from 'src/availability/entities/slot.entity';
import { Patient } from 'src/patients/entities/patient.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Slot, (slot) => slot.appointments)
  @JoinColumn({ name: 'slot_id' })
  slot: Slot;

  @ManyToOne(() => Patient, (patient) => patient.appointments)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column()
  reasonCategory: string;

  @Column({ nullable: true })
  reasonDescription: string;

  @Column({default:5})
  priority: number;

  @Column({ default: false })
  isUrgencyFinalized: boolean;

  @Column()
  startTime: string;

  @Column()
  endTime: string;
<<<<<<< HEAD
  date: any;
  reason: string;
=======

  @Column({ type: 'date', nullable: true })
  date: string;
  
  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
>>>>>>> 035a70113281dbbc9838180b26f257195925df7a
  time: string;

  @Column({ default: false }) 
  isConfirmed: boolean;
  
<<<<<<< HEAD
=======

>>>>>>> 035a70113281dbbc9838180b26f257195925df7a
}

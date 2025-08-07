import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Appointment } from 'src/appointment/entities/appointment.entity';

@Entity()
export class Slot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  date: string;

  @Column()
  startTime: string;

  @Column()
  endTime: string;

  @Column({ default: 'stream' }) 
  mode: string;

  @Column({ nullable: true })
  maxBookings: number;

  @Column({ default: 15 }) 
  slotDuration: number;

  @Column({ nullable: true })
  bufferDuration: number;

  @Column({ nullable: true, type: 'uuid' })
  recurringId: string | null;

  @Column({ default: 'normal' }) 
  type: string;

  @ManyToOne(() => Doctor, (doctor) => doctor.slots, { eager: true })
  doctor: Doctor;

  @OneToMany(() => Appointment, (appointment) => appointment.slot)
  appointments: Appointment[];
  isBooked: boolean;
}

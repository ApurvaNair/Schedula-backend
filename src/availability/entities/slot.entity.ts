import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Appointment } from 'src/appointment/entities/appointment.entity';

@Entity({ name: 'slot' })
export class Slot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  date: string; 

  @Column()
  startTime: string; 
  @Column()
  endTime: string; 

  @Column()
  mode: string; 

  @Column()
  maxBookings: number;

  @ManyToOne(() => Doctor, (doctor) => doctor.slots, { onDelete: 'CASCADE' })
  doctor: Doctor;

  @OneToMany(() => Appointment, (appointment) => appointment.slot)
  appointments: Appointment[];
}

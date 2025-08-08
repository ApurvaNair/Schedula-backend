import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Slot } from '../../availability/entities/slot.entity';

@Entity()
export class Doctor {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  name: string;

  @Column({ nullable: true })
  specialization: string;

  @Column({ type: 'int', nullable: true })
  experience: number;

  @Column({ nullable: true })
  clinicAddress: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ default: false })
  suggestNextAvailable: boolean;

  @OneToMany(() => Slot, (slot) => slot.doctor)
  slots: Slot[];
}

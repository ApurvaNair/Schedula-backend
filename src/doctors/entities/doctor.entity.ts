import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
}

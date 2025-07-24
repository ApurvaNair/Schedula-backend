import { User } from 'src/users/entities/user.entity';
import { Column, Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn } from 'typeorm';

@Entity()
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true, cascade: true })
  @JoinColumn({ name: 'user_id' }) 
  user: User;

  @Column()
  name: string;
  
  @Column({ nullable: true })
  age: number;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  medicalHistory: string;
}

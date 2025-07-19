import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  emailID: string;

  @Column()
  password: string;

  @Column()
  role: 'doctor' | 'patient'; 
}

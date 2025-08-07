import { DataSource } from 'typeorm';
import { User } from './users/entities/user.entity';
import { Doctor } from './doctors/entities/doctor.entity';
import { Patient } from './patients/entities/patient.entity';
import { Slot } from './availability/entities/slot.entity';
import { Appointment } from './appointment/entities/appointment.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'root',
  database: 'schedula',
  entities: [User, Doctor, Patient,Slot,Appointment],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

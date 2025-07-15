import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { Doctor } from './doctors/doctor.entity';
import { Patient } from './patients/patient.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'root',
  database: 'schedula',
  entities: [User, Doctor, Patient],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

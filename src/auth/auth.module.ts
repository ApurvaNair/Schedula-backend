import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from './jwt.strategy';

const jwtSecret = process.env.JWT_SECRET || '2f35904591dfe8111f20e9dc0ff201483bd785e4537afc6e4442bf70c16169f6e147e5def33bacc4ecaa50a4eb49825d92ea2565f736d2c63c14cbfba9f11e12'
console.log('JWT_SECRET loaded:', jwtSecret);

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: number;
  role: string;
  name: string;
  emailID: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || '2f35904591dfe8111f20e9dc0ff201483bd785e4537afc6e4442bf70c16169f6e147e5def33bacc4ecaa50a4eb49825d92ea2565f736d2c63c14cbfba9f11e12',
    });
  }

  async validate(payload: JwtPayload) {
    return {
      id: payload.sub,        
      role: payload.role,          
      name: payload.name,
      email: payload.emailID,      
    };
  }
}

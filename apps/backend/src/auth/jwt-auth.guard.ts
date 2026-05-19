import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface JwtUser {
  id: string;
  username: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.token;
    if (!token) throw new UnauthorizedException('No autenticado');
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new UnauthorizedException('Server misconfiguration');
      const payload = jwt.verify(token, secret) as any;
      req.user = { id: payload.sub, username: payload.username, role: payload.role } satisfies JwtUser;
      return true;
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
  }
}

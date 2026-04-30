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
    if (!token) throw new UnauthorizedException('Not authenticated');
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as any;
      req.user = { id: payload.sub, username: payload.username, role: payload.role } satisfies JwtUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

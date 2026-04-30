import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const HIERARCHY: Record<string, number> = { USER: 0, ADMIN: 1, SUPERADMIN: 2 };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Insufficient permissions');

    const userLevel = HIERARCHY[user.role] ?? 0;
    // Minimum level required: @Roles('ADMIN') → ADMIN or higher passes
    const minRequired = Math.min(...roles.map((r) => HIERARCHY[r] ?? 0));

    if (userLevel < minRequired) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}

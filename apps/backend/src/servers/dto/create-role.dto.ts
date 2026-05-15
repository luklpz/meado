import type { ServerPermissions } from '../../shared/types/permissions';

export class CreateRoleDto {
  name: string;
  color?: string;
  permissions: Partial<ServerPermissions>;
}

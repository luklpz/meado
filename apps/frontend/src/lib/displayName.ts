export interface NamedUser {
  username: string;
  name?: string | null;
}

/**
 * Precedence: nickname (server) > alias (friend) > name (display) > username (identifier)
 */
export function resolveDisplayName(
  user: NamedUser,
  alias?: string | null,
  nickname?: string | null,
): string {
  return nickname?.trim() || alias?.trim() || user.name?.trim() || user.username;
}

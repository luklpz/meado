export class CreateRoomDto {
  name: string;
  slug: string;
  description?: string;
  accessType?: 'PUBLIC' | 'PASSWORD' | 'WHITELIST';
  password?: string;
  proximityRadius?: number;
  maxPlayers?: number;
}
